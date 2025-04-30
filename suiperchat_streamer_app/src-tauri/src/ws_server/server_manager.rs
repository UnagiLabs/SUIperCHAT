//! WebSocketサーバーマネージャー
//!
//! WebSocketサーバーの起動・停止・監視を行うモジュールです。

use crate::database;
use crate::state::AppState;
use crate::types::ServerStatus;
use crate::ws_server::connection_manager::global::set_app_handle;
use crate::ws_server::routes::{
    obs_index_page, obs_script, obs_styles, status_page, websocket_route,
};
use crate::ws_server::server_utils::{format_socket_addr, resolve_static_file_path};
use crate::ws_server::tunnel;
use actix_files as fs;
use actix_web::{dev::ServerHandle, web, App, HttpRequest, HttpResponse, HttpServer};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tokio::runtime::{Handle as TokioHandle, Runtime};
use uuid::Uuid;

/// ## WebSocketサーバーを起動する
///
/// 指定されたホストとポートでWebSocketサーバーを非同期に起動します。
///
/// ### Arguments
/// - `app_state`: アプリケーション状態
/// - `app_handle`: Tauriアプリケーションハンドル
///
/// ### Returns
/// - `Result<(), String>`: 成功時はOk、失敗時はエラーメッセージ
pub fn start_server(app_state: &AppState, app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_handle_clone = app_handle.clone();
    println!("Attempting to start WebSocket server...");

    // 接続マネージャーにアプリケーションハンドルを設定
    set_app_handle(app_handle.clone());

    let server_handle_arc = Arc::clone(&app_state.server_handle);
    let runtime_handle_arc = Arc::clone(&app_state.runtime_handle);
    let host_arc = Arc::clone(&app_state.host);
    let port_arc = Arc::clone(&app_state.port);
    let obs_port_arc = Arc::clone(&app_state.obs_port);

    // 既にサーバーが起動しているかチェック
    {
        let handle_guard = server_handle_arc
            .lock()
            .map_err(|_| "Failed to lock server handle mutex for checking".to_string())?;

        if handle_guard.is_some() {
            // サーバーが既に起動している場合は、現在の状態を再送する
            send_current_server_status(app_handle_clone.clone())?;
            return Err("WebSocket server is already running.".to_string());
        }
    }

    // サーバーを別スレッドで起動
    std::thread::spawn(move || {
        launch_server_runtime(
            server_handle_arc,
            runtime_handle_arc,
            host_arc,
            port_arc,
            obs_port_arc,
            app_handle_clone,
        );
    });

    Ok(())
}

/// ## WebSocketサーバーを停止する
///
/// 実行中のWebSocketサーバーを停止します。
///
/// ### Arguments
/// - `app_state`: アプリケーション状態
/// - `app_handle`: Tauriアプリケーションハンドル
///
/// ### Returns
/// - `Result<(), String>`: 成功時はOk、失敗時はエラーメッセージ
pub fn stop_server(app_state: &AppState, app_handle: tauri::AppHandle) -> Result<(), String> {
    println!("Attempting to stop WebSocket server...");

    let server_handles_option: Option<(ServerHandle, ServerHandle)>;
    let runtime_handle_option: Option<TokioHandle>;

    {
        let mut handle_guard = app_state
            .server_handle
            .lock()
            .map_err(|_| "Failed to lock server handle mutex".to_string())?;
        server_handles_option = handle_guard.take();
    }

    {
        let mut rt_handle_guard = app_state
            .runtime_handle
            .lock()
            .map_err(|_| "Failed to lock runtime handle mutex".to_string())?;
        runtime_handle_option = rt_handle_guard.take();
    }

    // Loopholeトンネルを停止
    let tunnel_info_result = {
        let mut tunnel_guard = app_state
            .tunnel_info
            .lock()
            .map_err(|_| "Failed to lock tunnel info mutex".to_string())?;
        tunnel_guard.take()
    };

    // 現在のセッションIDを取得
    let session_id_option = match app_state.current_session_id.lock() {
        Ok(session_id_guard) => {
            // セッションIDが存在する場合はログ出力
            if let Some(ref session_id) = *session_id_guard {
                println!("現在のセッションID: {} - 終了処理を準備します", session_id);
            } else {
                println!("セッションIDが設定されていません - 終了処理はスキップされます");
            }
            session_id_guard.clone()
        }
        Err(e) => {
            // ロックエラーの場合はエラーログを出力し、None を返す
            eprintln!(
                "セッションID取得のためのロックに失敗しました: {} - セッション終了処理をスキップします",
                e
            );
            None
        }
    };

    // データベースプールを取得
    let db_pool_option = match app_state.db_pool.lock() {
        Ok(db_pool_guard) => {
            if db_pool_guard.is_none() {
                println!(
                    "データベース接続が初期化されていません - セッション終了処理をスキップします"
                );
            }
            db_pool_guard.clone()
        }
        Err(e) => {
            eprintln!(
                "データベースプール取得のためのロックに失敗しました: {} - セッション終了処理をスキップします",
                e
            );
            None
        }
    };

    // セッションIDをクリア
    match app_state.current_session_id.lock() {
        Ok(mut session_id_guard) => {
            if session_id_guard.is_some() {
                println!("セッションID: {:?} をクリアします", *session_id_guard);
                *session_id_guard = None;
            }
        }
        Err(e) => {
            eprintln!("セッションIDクリアのためのロックに失敗しました: {}", e);
            // 処理は継続
        }
    }

    if let Some((ws_server_handle, obs_server_handle)) = server_handles_option {
        if let Some(runtime_handle) = runtime_handle_option {
            println!("Stopping WebSocket and OBS servers using obtained handles...");

            // ホストとポートをクリア
            clear_server_info(app_state);

            // Cloudflaredトンネルを停止
            if let Some(Ok(tunnel_info)) = tunnel_info_result {
                println!("Stopping Cloudflared tunnel...");
                let tunnel_info_clone = tunnel_info.clone(); // クローンする
                runtime_handle.spawn(async move {
                    tunnel::stop_tunnel(&tunnel_info_clone).await;
                    println!("Cloudflared tunnel stopped successfully.");
                });
            } else if let Some(Err(e)) = tunnel_info_result {
                println!(
                    "No active Cloudflared tunnel to stop (previous error: {})",
                    e
                );
            } else {
                println!("No active Cloudflared tunnel to stop.");
            }

            // セッション終了処理
            let has_valid_session_id = session_id_option.is_some();
            let has_valid_db_pool = db_pool_option.is_some();

            // 必要な情報がそろっている場合のみDBを更新
            if has_valid_session_id && has_valid_db_pool {
                // 元の変数から値を取り出す（これにより所有権が移動する）
                if let (Some(session_id), Some(db_pool)) = (session_id_option, db_pool_option) {
                    println!(
                        "データベースにセッション終了を記録します: ID={}",
                        session_id
                    );

                    // 非同期でセッション終了処理
                    let session_id_clone = session_id.clone();
                    let db_pool_clone = db_pool.clone();
                    runtime_handle.spawn(async move {
                        match database::end_session(&db_pool_clone, &session_id_clone).await {
                            Ok(_) => println!("セッションが正常に終了しました: {}", session_id_clone),
                            Err(e) => {
                                let error_msg = format!("セッション終了処理中にエラーが発生しました: {}", e);
                                eprintln!("エラー: {}", error_msg);

                                // エラーの詳細情報を分析
                                match e {
                                    sqlx::Error::Database(db_err) => {
                                        eprintln!("データベースエラー詳細: {}", db_err);
                                        if db_err.message().contains("no such table") {
                                            eprintln!("テーブルが存在しない可能性があります。スキーマの初期化を確認してください。");
                                        }
                                    }
                                    sqlx::Error::RowNotFound => {
                                        eprintln!("セッションID: {} が見つかりませんでした。すでに終了しているか、削除された可能性があります。", session_id_clone);
                                    }
                                    _ => {
                                        eprintln!("その他のSQLエラー: {}", e);
                                    }
                                }
                            }
                        }
                    });
                }
            } else {
                println!("セッション終了処理をスキップします");
                if !has_valid_session_id {
                    println!("理由: セッションIDが設定されていません。サーバーが正常に起動していなかった可能性があります。");
                }

                if !has_valid_db_pool {
                    println!("理由: データベース接続が初期化されていません。アプリケーションの起動時にエラーが発生した可能性があります。");
                }
            }

            // 両方のサーバーを停止するタスクをspawn
            let app_handle_clone = app_handle.clone();
            runtime_handle.spawn(async move {
                println!("Sending stop signal to WS and OBS servers via Tokio runtime handle...");
                // 両方の stop を並行して実行
                let ws_stop = ws_server_handle.stop(true);
                let obs_stop = obs_server_handle.stop(true);
                tokio::join!(ws_stop, obs_stop);
                println!("Both server stop signals sent and awaited.");

                // サーバー停止成功イベントを発行
                emit_server_status(&app_handle_clone, false, None, None);
            });
            println!("Server stop initiated.");

            Ok(())
        } else {
            Err("No runtime handle available to stop the servers properly.".to_string())
        }
    } else {
        emit_server_status(&app_handle, false, None, None);
        println!("No active servers to stop.");
        Ok(())
    }
}

/// ## サーバー状態通知イベント発行
///
/// サーバーの状態を通知するイベントを発行します。
///
/// ### Arguments
/// - `app_handle`: Tauriアプリケーションハンドル
/// - `is_running`: サーバー実行状態
/// - `ws_url`: WebSocket URL (Option<String>)
/// - `obs_url`: OBS URL (Option<String>)
fn emit_server_status(
    app_handle: &tauri::AppHandle,
    is_running: bool,
    ws_url: Option<String>,
    obs_url: Option<String>,
) {
    // CGNAT検出とIP取得失敗フラグ
    let app_state = app_handle.state::<AppState>();
    let cgnat_detected = *app_state.cgnat_detected.lock().unwrap();
    let global_ip_fetch_failed = *app_state.global_ip_fetch_failed.lock().unwrap();

    // ServerStatusを構築
    let status = ServerStatus {
        is_running,
        ws_url,
        obs_url,
        global_ip_fetch_failed,
        cgnat_detected,
        cloudflare_http_url: None,
        tunnel_status: if is_running {
            "Starting".to_string()
        } else {
            "Stopped".to_string()
        },
        tunnel_error: None,
    };

    // イベント発行
    if let Err(e) = app_handle.emit("server_status_updated", status) {
        eprintln!("Failed to emit server status event: {}", e);
    }
}

/// ## 現在のサーバーステータスを送信する
///
/// 現在のサーバー状態を取得し、フロントエンドにイベントを発行します。
///
/// ### Arguments
/// - `app_state`: アプリケーション状態
/// - `app_handle`: Tauriアプリケーションハンドル
///
/// ### Returns
/// - `Result<(), String>`: 成功時はOk、失敗時はエラーメッセージ
fn send_current_server_status(app_handle: tauri::AppHandle) -> Result<(), String> {
    // すでに更新済みのemit_server_status_with_tunnel関数を呼び出す
    emit_server_status_with_tunnel(&app_handle);
    Ok(())
}

/// ## サーバーランタイムを起動する
///
/// Tokioランタイムを作成し、WebSocketサーバーとOBSサーバーを起動します。
///
/// ### Arguments
/// - 各種状態保持用のArc<Mutex>
/// - `app_handle`: Tauriアプリケーションハンドル
fn launch_server_runtime(
    server_handle_arc: Arc<Mutex<Option<(ServerHandle, ServerHandle)>>>,
    runtime_handle_arc: Arc<Mutex<Option<TokioHandle>>>,
    host_arc: Arc<Mutex<Option<String>>>,
    port_arc: Arc<Mutex<Option<u16>>>,
    obs_port_arc: Arc<Mutex<Option<u16>>>,
    app_handle: tauri::AppHandle,
) {
    // Tokioランタイムの作成
    let rt = match Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("Failed to create Tokio runtime: {}", e);
            // 起動失敗イベントを発行
            emit_server_status(&app_handle, false, None, None);
            return;
        }
    };

    // ランタイムハンドルの保存
    let tokio_handle = rt.handle().clone();
    {
        let mut rt_handle_guard = runtime_handle_arc
            .lock()
            .expect("Failed to lock runtime handle mutex for storing");
        *rt_handle_guard = Some(tokio_handle);
        println!("Tokio runtime handle stored.");
    }

    // ランタイム内でサーバーを起動
    rt.block_on(async {
        run_servers(
            server_handle_arc,
            host_arc,
            port_arc,
            obs_port_arc,
            runtime_handle_arc,
            app_handle,
        )
        .await;
    });

    println!("Server thread finished.");
}

/// ## サーバーを実行する
///
/// WebSocketサーバーとOBSサーバーを並列に実行します。
///
/// ### Arguments
/// - 各種状態保持用のArc<Mutex>
/// - `app_handle`: Tauriアプリケーションハンドル
async fn run_servers(
    server_handle_arc: Arc<Mutex<Option<(ServerHandle, ServerHandle)>>>,
    host_arc: Arc<Mutex<Option<String>>>,
    port_arc: Arc<Mutex<Option<u16>>>,
    obs_port_arc: Arc<Mutex<Option<u16>>>,
    runtime_handle_arc: Arc<Mutex<Option<TokioHandle>>>,
    app_handle: tauri::AppHandle,
) {
    let host = "127.0.0.1";
    let ws_port = 8082; // WebSocket用ポート（視聴者用）
    let obs_port = 8081; // OBS用静的ファイル配信ポート
    let ws_path = "/ws";

    println!(
        "Starting WebSocket server at ws://{}:{}{}",
        host, ws_port, ws_path
    );
    println!("Starting OBS server at http://{}:{}/obs/", host, obs_port);
    println!("Note: Client connections MUST include the '/ws' path");

    // フロントエンドにトンネル起動中のステータスを通知
    let _ = send_current_server_status(app_handle.clone());
    println!("Tunnel startup in progress notification sent to frontend.");

    // 外部IP取得とCGNAT判定処理を非同期で実行
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        // AppStateを取得
        let app_state = app_handle_clone.state::<AppState>();

        // 外部IP取得を実行
        match crate::ws_server::ip_utils::get_external_ip(&app_handle_clone).await {
            Ok(ip) => {
                // 成功した場合、IPをAppStateに保存
                println!("[Test Log] 外部IPアドレスの取得に成功: {}", ip); // Test Log
                {
                    let mut external_ip_guard = app_state.external_ip.lock().unwrap();
                    *external_ip_guard = Some(ip);
                    println!(
                        "[Test Log] AppState.external_ip set to: {:?}",
                        *external_ip_guard
                    ); // Test Log
                }

                // 失敗フラグをfalseに設定
                {
                    let mut failed_guard = app_state.global_ip_fetch_failed.lock().unwrap();
                    *failed_guard = false;
                    println!(
                        "[Test Log] AppState.global_ip_fetch_failed set to: {}",
                        *failed_guard
                    ); // Test Log
                }

                // CGNAT判定を実行
                match crate::ws_server::ip_utils::check_cgnat(ip).await {
                    Ok(is_cgnat) => {
                        println!("[Test Log] CGNAT判定成功: is_cgnat = {}", is_cgnat); // Test Log
                                                                                       // CGNAT判定結果をAppStateに保存
                        let mut cgnat_guard = app_state.cgnat_detected.lock().unwrap();
                        *cgnat_guard = is_cgnat;
                        println!(
                            "[Test Log] AppState.cgnat_detected set to: {}",
                            *cgnat_guard
                        ); // Test Log

                        if is_cgnat {
                            println!("警告: CGNAT環境が検出されました。WebSocketサーバーへの外部アクセスが制限される可能性があります。");
                        } else {
                            println!("CGNAT環境は検出されませんでした。WebSocketサーバーへの外部アクセスは正常に行える可能性が高いです。");
                        }
                    }
                    Err(e) => {
                        // CGNAT判定に失敗した場合、警告としてtrueを設定
                        println!(
                            "[Test Log] CGNAT判定に失敗: {}. Setting cgnat_detected to true.",
                            e
                        ); // Test Log
                        let mut cgnat_guard = app_state.cgnat_detected.lock().unwrap();
                        *cgnat_guard = true; // 判定失敗時は安全側に倒してtrueに
                        println!(
                            "[Test Log] AppState.cgnat_detected set to: {}",
                            *cgnat_guard
                        ); // Test Log
                    }
                }
            }
            Err(e) => {
                // 失敗した場合、エラーログを出力し失敗フラグを設定
                eprintln!("[Test Log] 外部IP取得エラー: {}", e); // Test Log
                {
                    let mut failed_guard = app_state.global_ip_fetch_failed.lock().unwrap();
                    *failed_guard = true;
                    println!(
                        "[Test Log] AppState.global_ip_fetch_failed set to: {}",
                        *failed_guard
                    ); // Test Log
                }

                // IP取得に失敗した場合もCGNAT判定は不明なため警告としてtrueを設定
                {
                    let mut cgnat_guard = app_state.cgnat_detected.lock().unwrap();
                    *cgnat_guard = true;
                    println!(
                        "[Test Log] AppState.cgnat_detected set to: {} (due to IP fetch failure)",
                        *cgnat_guard
                    ); // Test Log
                }
                println!("外部IP取得に失敗したため、CGNATの有無を判定できません。安全のため、CGNATが存在する可能性があると仮定します。");
            }
        }

        // 新しいクローンを作成
        let app_handle_for_status = app_handle_clone.clone();
        send_current_server_status(app_handle_for_status).unwrap_or_else(|e| {
            eprintln!("IP取得・CGNAT判定後のステータス送信に失敗: {}", e);
        });
    });

    // Cloudflaredトンネルを必ず起動（WebSocketサーバー起動前）
    println!(
        "Starting Cloudflared tunnel for WebSocket port {}...",
        ws_port
    );
    let app_handle_for_tunnel = app_handle.clone();

    // トンネル起動処理を非同期で実行
    tokio::spawn(async move {
        match tunnel::start_tunnel(&app_handle_for_tunnel, ws_port).await {
            Ok(tunnel_info) => {
                println!(
                    "Cloudflared tunnel started successfully at: {}",
                    tunnel_info.url
                );

                // トンネル情報をAppStateに保存
                if let Ok(mut tunnel_guard) =
                    app_handle_for_tunnel.state::<AppState>().tunnel_info.lock()
                {
                    *tunnel_guard = Some(Ok(tunnel_info));
                }

                // サーバー状態変更イベントを発行
                emit_server_status_with_tunnel(&app_handle_for_tunnel);
            }
            Err(e) => {
                eprintln!("Failed to start Cloudflared tunnel: {}", e);

                // エラー情報をAppStateに保存
                if let Ok(mut tunnel_guard) =
                    app_handle_for_tunnel.state::<AppState>().tunnel_info.lock()
                {
                    *tunnel_guard = Some(Err(e));
                }

                // サーバー状態変更イベントを発行
                emit_server_status_with_tunnel(&app_handle_for_tunnel);
            }
        }
    });

    // 静的ファイルの配信パスを解決
    let static_path = resolve_static_file_path();
    let obs_path = static_path.join("obs");

    // OBSディレクトリの存在確認
    if !obs_path.exists() {
        eprintln!(
            "警告: OBS用静的ファイルディレクトリが見つかりません: {}",
            obs_path.display()
        );
        eprintln!("OBS表示機能は利用できない可能性があります。");
    }

    let obs_path_str = obs_path.to_string_lossy().to_string();
    println!("Serving OBS static files from: {}", obs_path_str);

    // WebSocketサーバー（視聴者用）を作成
    let websocket_server_result = HttpServer::new(move || {
        App::new()
            // WebSocketエンドポイント
            .service(websocket_route)
            // エラーハンドラー
            .default_service(
                web::route().to(|| async { HttpResponse::NotFound().body("404 Not Found") }),
            )
    })
    .bind((host, ws_port));

    // OBS用静的ファイルサーバーを作成
    let obs_path_clone = obs_path.clone();
    let obs_server_result = HttpServer::new(move || {
        App::new()
            // ステータスページ
            .service(status_page)
            // 追加したOBS用ルートハンドラーを登録
            .service(obs_index_page)
            .service(obs_styles)
            .service(obs_script)
            // OBS用静的ファイル配信
            .service(
                fs::Files::new("/obs", obs_path_clone.clone())
                    .index_file("index.html")
                    .use_last_modified(true)
                    .prefer_utf8(true)
                    .default_handler(web::to(|req: HttpRequest| async move {
                        let path = req.path().to_string();
                        if path.ends_with("/") || path == "/obs" {
                            HttpResponse::Ok()
                                .content_type("text/html; charset=utf-8")
                                .body(include_str!("../../src/static/obs/index.html"))
                        } else {
                            HttpResponse::NotFound().body("404 - File not found")
                        }
                    })),
            )
            // エラーハンドラー
            .default_service(
                web::route().to(|| async { HttpResponse::NotFound().body("404 Not Found") }),
            )
    })
    .bind((host, obs_port));

    // WebSocketサーバーとOBSサーバーのバインド結果を評価
    match (websocket_server_result, obs_server_result) {
        (Ok(ws_server), Ok(obs_server)) => {
            // 両方のサーバーが正常にバインドされた場合
            println!("Both WebSocket and OBS servers bound successfully.");

            // バインドされたアドレスを取得
            let ws_addrs = ws_server.addrs();
            let obs_addrs = obs_server.addrs();

            println!("WS Addrs: {:?}", ws_addrs);
            println!("OBS Addrs: {:?}", obs_addrs);

            let ws_addr_str = ws_addrs
                .first()
                .map(|addr| format_socket_addr(addr, "ws", "/ws"))
                .unwrap_or_else(|| format!("ws://{}:{}{}", host, ws_port, ws_path));

            let obs_addr_str = obs_addrs
                .first()
                .map(|addr| format_socket_addr(addr, "http", "/obs/"))
                .unwrap_or_else(|| format!("http://{}:{}/obs/", host, obs_port));

            println!("Generated WebSocket URL: {}", ws_addr_str);
            println!("Generated OBS URL: {}", obs_addr_str);

            // WebSocketサーバーの実行インスタンス (Server型) を取得
            let ws_server_runner = ws_server.run();
            let server_handle = ws_server_runner.handle(); // ハンドル取得

            // OBSサーバーの実行インスタンスを取得
            let obs_server_runner = obs_server.run();
            let obs_server_handle = obs_server_runner.handle(); // OBSサーバーのハンドルも取得

            // AppStateにハンドルなどを保存
            {
                let mut handle_guard = server_handle_arc
                    .lock()
                    .expect("Failed to lock server handle mutex for storing");
                // WebSocketサーバーとOBSサーバーのハンドルをタプルで保存
                *handle_guard = Some((server_handle, obs_server_handle));
                println!("WebSocket and OBS server handles stored in AppState.");
            }

            // hostとportをAppStateに保存
            {
                let mut host_guard = host_arc
                    .lock()
                    .expect("Failed to lock host mutex for storing");
                *host_guard = Some(host.to_string());
                println!("Host '{}' stored in AppState.", host);
            }
            {
                let mut port_guard = port_arc
                    .lock()
                    .expect("Failed to lock port mutex for storing");
                *port_guard = Some(ws_port);
                println!("Port '{}' stored in AppState.", ws_port);
            }
            {
                let mut obs_port_guard = obs_port_arc
                    .lock()
                    .expect("Failed to lock obs_port mutex for storing");
                *obs_port_guard = Some(obs_port);
                println!("OBS Port '{}' stored in AppState.", obs_port);
            }

            // 新しいセッションIDを生成してAppStateとDBに保存
            let session_id = Uuid::new_v4().to_string();
            println!("Generated new session ID: {}", session_id);

            // AppStateからDBプールを取得
            let app_state = app_handle.state::<AppState>();
            let db_pool_option = app_state
                .db_pool
                .lock()
                .expect("Failed to lock db_pool mutex")
                .clone();

            // セッションIDをAppStateに保存
            {
                let mut session_id_guard = app_state
                    .current_session_id
                    .lock()
                    .expect("Failed to lock current_session_id mutex");
                *session_id_guard = Some(session_id.clone());
                println!("Session ID '{}' stored in AppState.", session_id);
            }

            // DBにセッションを作成（同期的に完了を待つ）
            if let Some(db_pool) = db_pool_option {
                match database::create_session(&db_pool, &session_id).await {
                    // tokio::spawn を削除し、直接 await
                    Ok(_) => println!(
                        "セッションがデータベースに正常に保存されました: {}",
                        session_id
                    ),
                    Err(e) => {
                        // セッション作成失敗時はエラーログを出力し、サーバー起動を中止することも検討
                        eprintln!(
                            "セッションのデータベース保存中にエラーが発生しました: {}",
                            e
                        );
                        // セッション作成に失敗したら、後続の処理に進まない
                        return; // ★★★★★ 早期リターンを追加 ★★★★★
                    }
                }
            } else {
                eprintln!(
                    "データベース接続プールが初期化されていないため、セッションを保存できません"
                );
                // DBプールがない場合も、後続の処理に進まない
                return; // ★★★★★ 早期リターンを追加 ★★★★★
            }

            // サーバー起動成功イベントを発行
            emit_server_status_with_tunnel(&app_handle);

            // 両方のサーバーを並行して実行
            println!("Starting both servers concurrently using tokio::try_join!...");
            if let Err(e) = tokio::try_join!(ws_server_runner, obs_server_runner) {
                eprintln!("Server execution error in try_join!: {}", e);
                // エラーが発生した場合も停止イベントを発行
                emit_server_status(&app_handle, false, None, None);
            } else {
                println!("Both servers joined successfully and stopped gracefully.");
                // 正常終了時にも停止イベントを発行
                emit_server_status(&app_handle, false, None, None);
            }
        }
        (ws_result, obs_result) => {
            // どちらかまたは両方のバインドに失敗した場合
            let mut error_msg = String::new();
            if let Err(e) = ws_result {
                error_msg.push_str(&format!("Failed to bind WebSocket server: {}. ", e));
            }
            if let Err(e) = obs_result {
                error_msg.push_str(&format!("Failed to bind OBS server: {}. ", e));
            }
            eprintln!("{}", error_msg.trim());
            eprintln!("Neither server will start.");

            // サーバー起動失敗イベントを発行
            emit_server_status(&app_handle, false, None, None);
        }
    }

    // クリーンアップ処理
    cleanup_server_resources(
        server_handle_arc,
        runtime_handle_arc,
        host_arc,
        port_arc,
        obs_port_arc,
    );
}

/// ## サーバー情報をクリアする
///
/// ホスト、ポート情報をクリアします。
///
/// ### Arguments
/// - `app_state`: アプリケーション状態
fn clear_server_info(app_state: &AppState) {
    {
        let mut host_guard = app_state
            .host
            .lock()
            .expect("Failed to lock host mutex for clearing");
        *host_guard = None;
        println!("Host cleared from AppState.");
    }
    {
        let mut port_guard = app_state
            .port
            .lock()
            .expect("Failed to lock port mutex for clearing");
        *port_guard = None;
        println!("Port cleared from AppState.");
    }
    {
        let mut obs_port_guard = app_state
            .obs_port
            .lock()
            .expect("Failed to lock obs_port mutex for clearing");
        *obs_port_guard = None;
        println!("OBS Port cleared from AppState.");
    }
}

/// ## サーバーリソースをクリーンアップする
///
/// サーバーリソースをクリーンアップします。
///
/// ### Arguments
/// - 各種状態保持用のArc<Mutex>
fn cleanup_server_resources(
    server_handle_arc: Arc<Mutex<Option<(ServerHandle, ServerHandle)>>>,
    runtime_handle_arc: Arc<Mutex<Option<TokioHandle>>>,
    host_arc: Arc<Mutex<Option<String>>>,
    port_arc: Arc<Mutex<Option<u16>>>,
    obs_port_arc: Arc<Mutex<Option<u16>>>,
) {
    println!("Cleaning up server resources...");
    {
        let mut handle_guard = server_handle_arc
            .lock()
            .expect("Failed to lock server handle after run");
        *handle_guard = None;
        println!("Server handles cleared from AppState.");
    }
    {
        let mut rt_handle_guard = runtime_handle_arc
            .lock()
            .expect("Failed to lock runtime handle after run");
        *rt_handle_guard = None;
        println!("Runtime handle cleared from AppState.");
    }

    // ホストとポートもクリア
    {
        let mut host_guard = host_arc
            .lock()
            .expect("Failed to lock host mutex after run");
        *host_guard = None;
        println!("Host cleared from AppState.");
    }
    {
        let mut port_guard = port_arc
            .lock()
            .expect("Failed to lock port mutex after run");
        *port_guard = None;
        println!("Port cleared from AppState.");
    }
    {
        let mut obs_port_guard = obs_port_arc
            .lock()
            .expect("Failed to lock obs_port mutex after run");
        *obs_port_guard = None;
        println!("OBS Port cleared from AppState.");
    }
    println!("Cleanup finished.");
}

/// ## トンネル情報を含めたサーバーステータス送信関数を追加
///
/// サーバーの状態を通知するイベントを発行します。
///
/// ### Arguments
/// - `app_handle`: Tauriアプリケーションハンドル
fn emit_server_status_with_tunnel(app_handle: &tauri::AppHandle) {
    let app_state = app_handle.state::<AppState>();

    // 必要な情報を取得
    let is_running = app_state.server_handle.lock().unwrap().is_some();

    // Cloudflared Tunnel関連の情報を取得
    let (tunnel_http_url, tunnel_status, tunnel_error) = {
        if is_running {
            if let Ok(tunnel_guard) = app_state.tunnel_info.lock() {
                match &*tunnel_guard {
                    Some(Ok(tunnel_info)) => {
                        // トンネル接続成功
                        (Some(tunnel_info.url.clone()), "Running".to_string(), None)
                    }
                    Some(Err(e)) => {
                        // トンネル接続失敗
                        (None, "Failed".to_string(), Some(e.to_string()))
                    }
                    None => {
                        // トンネル情報がまだ設定されていない
                        (None, "Starting".to_string(), None)
                    }
                }
            } else {
                // トンネル情報ミューテックスのロックに失敗
                (None, "Starting".to_string(), None)
            }
        } else {
            // サーバーが停止している
            (None, "Stopped".to_string(), None)
        }
    };

    // WebSocketのURL
    let ws_url = if is_running {
        if tunnel_status == "Running" && tunnel_http_url.is_some() {
            // トンネル接続成功時はCloudflaredのURLを使用
            let wss_url = tunnel_http_url
                .as_ref()
                .unwrap()
                .replace("https://", "wss://")
                + "/ws";
            Some(wss_url)
        } else {
            // それ以外の場合はローカルURLを使用
            let host = app_state
                .host
                .lock()
                .unwrap()
                .clone()
                .unwrap_or_else(|| "127.0.0.1".to_string());
            let port = (*app_state.port.lock().unwrap()).unwrap_or(8082);
            Some(format!("ws://{}:{}/ws", host, port))
        }
    } else {
        None
    };

    // OBSのURL
    let obs_url = if is_running {
        let host = app_state
            .host
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let obs_port = (*app_state.obs_port.lock().unwrap()).unwrap_or(8081);
        // 必ず/obsパスを含める
        Some(format!("http://{}:{}/obs/", host, obs_port))
    } else {
        None
    };

    // CGNAT検出とIP取得失敗フラグ
    let cgnat_detected = *app_state.cgnat_detected.lock().unwrap();
    let global_ip_fetch_failed = *app_state.global_ip_fetch_failed.lock().unwrap();

    // ServerStatusを構築
    let status = ServerStatus {
        is_running,
        ws_url,
        obs_url,
        global_ip_fetch_failed,
        cgnat_detected,
        cloudflare_http_url: tunnel_http_url,
        tunnel_status,
        tunnel_error,
    };

    // イベント発行
    if let Err(e) = app_handle.emit("server_status_updated", status) {
        eprintln!("Failed to emit server status event: {}", e);
    }
}
