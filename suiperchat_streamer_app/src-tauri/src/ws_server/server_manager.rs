//! WebSocketサーバーマネージャー
//!
//! WebSocketサーバーの起動・停止・監視を行うモジュールです。

use crate::database;
use crate::state::AppState;
use crate::types::ServerStatus;
use crate::ws_server::connection_manager::global::set_app_handle;
use crate::ws_server::routes::{status_page, websocket_route};
use crate::ws_server::server_utils::{format_socket_addr, resolve_static_file_path};
use actix_files as fs;
use actix_web::{dev::ServerHandle, web, App, HttpResponse, HttpServer};
use log::{error, info};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tauri::Manager;
use tokio::runtime::{Handle as TokioHandle, Runtime};

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
            send_current_server_status(app_state, app_handle_clone.clone())?;
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
    let session_id_option: Option<i32>;

    // サーバーハンドルを取得・クリア
    {
        let mut handle_guard = app_state
            .server_handle
            .lock()
            .map_err(|_| "Failed to lock server handle mutex".to_string())?;
        server_handles_option = handle_guard.take();
    }

    // ランタイムハンドルを取得（クリアせず）
    {
        let rt_handle_guard = app_state
            .runtime_handle
            .lock()
            .map_err(|_| "Failed to lock runtime handle mutex".to_string())?;
        runtime_handle_option = rt_handle_guard.clone();
    }

    // セッションIDを取得・クリア
    {
        let mut session_id_guard = app_state
            .current_session_id
            .lock()
            .map_err(|_| "Failed to lock session ID mutex".to_string())?;
        session_id_option = session_id_guard.take();
    }

    if let Some((ws_server_handle, obs_server_handle)) = server_handles_option {
        if let Some(runtime_handle) = runtime_handle_option {
            println!("Stopping WebSocket and OBS servers using obtained handles...");

            // ホストとポートをクリア
            clear_server_info(app_state);

            // アクティブなセッションを終了
            if let Some(session_id) = session_id_option {
                let app_handle_clone2 = app_handle.clone();
                runtime_handle.spawn(async move {
                    if let Err(e) = end_database_session(&app_handle_clone2, session_id).await {
                        println!("Failed to end database session: {}", e);
                    }
                });
            }

            // サーバーのグレースフルシャットダウン
            let ws_server_handle = ws_server_handle;
            let obs_server_handle = obs_server_handle;
            runtime_handle.spawn(async move {
                println!("Sending stop signal to WS and OBS servers via Tokio runtime handle...");
                // 両方の stop を並行して実行
                let ws_stop = ws_server_handle.stop(true);
                let obs_stop = obs_server_handle.stop(true);
                tokio::join!(ws_stop, obs_stop);
                println!("Both server stop signals sent and awaited.");

                // サーバー停止成功イベントを発行
                emit_server_status(&app_handle, false, None, None);
            });
            println!("Server stop initiated.");

            Ok(())
        } else {
            eprintln!("Error: Server handles exist but runtime handle is missing.");
            // 停止できなかったサーバーハンドルを戻す
            {
                let mut handle_guard = app_state
                    .server_handle
                    .lock()
                    .expect("Failed to re-lock server handle mutex");
                *handle_guard = Some((ws_server_handle, obs_server_handle));
            }
            // セッションIDも戻す
            if let Some(session_id) = session_id_option {
                let mut session_id_guard = app_state
                    .current_session_id
                    .lock()
                    .expect("Failed to re-lock session ID mutex");
                *session_id_guard = Some(session_id);
            }
            Err("Internal error: Runtime handle missing, cannot stop servers.".to_string())
        }
    } else {
        println!("Server is not running or already stopped.");
        // サーバーが起動していない場合も停止イベントを送信する
        emit_server_status(&app_handle, false, None, None);
        Err("Server not running.".to_string())
    }
}

/// ## 現在のサーバー状態を送信する
///
/// 現在のサーバー状態をクライアントに通知します。
///
/// ### Arguments
/// - `app_state`: アプリケーション状態
/// - `app_handle`: Tauriアプリケーションハンドル
///
/// ### Returns
/// - `Result<(), String>`: 成功時はOk、失敗時はエラーメッセージ
fn send_current_server_status(
    app_state: &AppState,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // 既存のサーバーステータスを取得して送信
    if let (Some(ws_url), Some(obs_url)) = (
        app_state.host.lock().unwrap().as_ref().and_then(|h| {
            app_state.port.lock().unwrap().as_ref().map(|p| {
                let addr = SocketAddr::new(
                    h.parse()
                        .unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1))),
                    *p,
                );
                format_socket_addr(&addr, "ws", "/ws")
            })
        }),
        app_state.host.lock().unwrap().as_ref().and_then(|h| {
            app_state.port.lock().unwrap().map(|_p| {
                let addr = SocketAddr::new(
                    h.parse()
                        .unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1))),
                    8081,
                );
                format_socket_addr(&addr, "http", "/obs/")
            })
        }),
    ) {
        let status_payload = ServerStatus {
            is_running: true,
            obs_url: Some(obs_url),
            ws_url: Some(ws_url),
        };

        if let Err(e) = app_handle.emit("server_status_updated", status_payload) {
            eprintln!(
                "Failed to re-emit server_status_updated (already running) event: {}",
                e
            );
            return Err(format!("Failed to emit server status: {}", e));
        }
    }

    Ok(())
}

/// ## サーバーランタイムを起動する
///
/// Tokioランタイムを作成し、WebSocketサーバーとOBSサーバーを起動します。
///
/// ### Arguments
/// - `server_handle_arc`: サーバーハンドルを保持するArc<Mutex>
/// - `runtime_handle_arc`: ランタイムハンドルを保持するArc<Mutex>
/// - `host_arc`: ホスト名を保持するArc<Mutex>
/// - `port_arc`: ポート番号を保持するArc<Mutex>
/// - `obs_port_arc`: OBSポート番号を保持するArc<Mutex>
/// - `app_handle`: Tauriアプリケーションハンドル
fn launch_server_runtime(
    server_handle_arc: Arc<Mutex<Option<(ServerHandle, ServerHandle)>>>,
    runtime_handle_arc: Arc<Mutex<Option<TokioHandle>>>,
    host_arc: Arc<Mutex<Option<String>>>,
    port_arc: Arc<Mutex<Option<u16>>>,
    obs_port_arc: Arc<Mutex<Option<u16>>>,
    app_handle: tauri::AppHandle,
) {
    // 新しいTokioランタイムを作成
    match Runtime::new() {
        Ok(rt) => {
            // ランタイムハンドルを取得・保存
            let handle = rt.handle().clone();
            {
                let mut rt_handle_guard = runtime_handle_arc
                    .lock()
                    .expect("Failed to lock runtime handle mutex");
                *rt_handle_guard = Some(handle.clone());
            }

            // ランタイムをブロックさせて非同期処理を実行
            rt.block_on(async {
                if let Err(e) = run_servers(
                    server_handle_arc.clone(),
                    host_arc.clone(),
                    port_arc.clone(),
                    obs_port_arc.clone(),
                    runtime_handle_arc.clone(),
                    app_handle.clone(),
                )
                .await
                {
                    eprintln!("Server runtime error: {}", e);
                    cleanup_server_resources(
                        server_handle_arc,
                        runtime_handle_arc,
                        host_arc,
                        port_arc,
                        obs_port_arc,
                    );
                    // サーバー起動失敗イベントを発行
                    emit_server_status(&app_handle, false, None, None);
                }
            });
        }
        Err(e) => {
            eprintln!("Failed to create Tokio runtime: {}", e);
            emit_server_status(&app_handle, false, None, None);
        }
    }
}

/// ## WebSocketサーバーとOBSサーバーを実行する
///
/// 指定されたホストとポートでWebSocketサーバーとOBSサーバーを起動します。
///
/// ### Arguments
/// - `server_handle_arc`: サーバーハンドルを保持するArc<Mutex>
/// - `host_arc`: ホスト名を保持するArc<Mutex>
/// - `port_arc`: ポート番号を保持するArc<Mutex>
/// - `obs_port_arc`: OBSポート番号を保持するArc<Mutex>
/// - `runtime_handle_arc`: ランタイムハンドルを保持するArc<Mutex>
/// - `app_handle`: Tauriアプリケーションハンドル
///
/// ### Returns
/// - `Result<(), String>`: 成功時はOk、失敗時はエラーメッセージ
async fn run_servers(
    server_handle_arc: Arc<Mutex<Option<(ServerHandle, ServerHandle)>>>,
    host_arc: Arc<Mutex<Option<String>>>,
    port_arc: Arc<Mutex<Option<u16>>>,
    obs_port_arc: Arc<Mutex<Option<u16>>>,
    runtime_handle_arc: Arc<Mutex<Option<TokioHandle>>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // ホストとポートを設定
    let host = "127.0.0.1";
    let port: u16 = 8080;
    let obs_port: u16 = 8081;

    let host_string = host.to_string();
    *host_arc.lock().unwrap() = Some(host_string.clone());
    *port_arc.lock().unwrap() = Some(port);
    *obs_port_arc.lock().unwrap() = Some(obs_port);

    // データベースセッションを作成
    let app_state = app_handle.state::<AppState>();
    let session_id = create_database_session(&app_state).await?;

    // AppStateにセッションIDを保存
    if let Ok(mut session_id_guard) = app_state.current_session_id.lock() {
        *session_id_guard = Some(session_id);
        info!("セッションIDをAppStateに設定しました: {}", session_id);
    } else {
        error!("セッションID保存のためのAppStateロック取得に失敗しました");
        return Err("セッションID保存のためのAppStateロック取得に失敗しました".to_string());
    }

    // ポートがすでに使用されていないか確認
    // WebSocketサーバーをバインド
    let app_handle_ws = app_handle.clone(); // WebSocketサーバー用
    let app_handle_obs = app_handle.clone(); // OBSサーバー用

    let ws_server = HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(app_handle_ws.clone()))
            .service(websocket_route)
            .service(status_page)
            .service(fs::Files::new("/static", resolve_static_file_path()).show_files_listing())
            .default_service(
                web::route().to(|| async { HttpResponse::NotFound().body("Not Found") }),
            )
    })
    .workers(2)
    .bind(format!("{}:{}", host, port))
    .map_err(|e| format!("Failed to bind WebSocket server: {}", e))?;

    let obs_server = HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(app_handle_obs.clone()))
            .service(status_page)
            .service(fs::Files::new("/static", resolve_static_file_path()).show_files_listing())
            .default_service(
                web::route().to(|| async { HttpResponse::NotFound().body("Not Found") }),
            )
    })
    .workers(2)
    .bind(format!("{}:{}", host, obs_port))
    .map_err(|e| format!("Failed to bind OBS server: {}", e))?;

    // サーバーハンドルを取得
    let ws_server_handle = ws_server.run();
    let obs_server_handle = obs_server.run();

    // サーバーURLを生成
    let ws_socket_addr = SocketAddr::new(host.parse().unwrap(), port);
    let obs_socket_addr = SocketAddr::new(host.parse().unwrap(), obs_port);
    let ws_url = format_socket_addr(&ws_socket_addr, "ws", "/ws");
    let obs_url = format_socket_addr(&obs_socket_addr, "http", "/obs/");

    println!("WebSocket server started at: {}", ws_url);
    println!("OBS server started at: {}", obs_url);

    // サーバーハンドルを保存
    let ws_handle = ws_server_handle.handle();
    let obs_handle = obs_server_handle.handle();
    {
        let mut handle_guard = server_handle_arc
            .lock()
            .map_err(|_| "Failed to lock server handle mutex".to_string())?;
        *handle_guard = Some((ws_handle, obs_handle));
    }

    // サーバー起動成功イベントを発行
    emit_server_status(&app_handle, true, Some(ws_url), Some(obs_url));

    // サーバーを実行し続ける
    let (_, _) = tokio::join!(ws_server_handle, obs_server_handle);

    // サーバーが完全に終了した時の処理
    println!("WebSocket and OBS servers have gracefully stopped.");
    cleanup_server_resources(
        server_handle_arc,
        runtime_handle_arc,
        host_arc,
        port_arc,
        obs_port_arc,
    );

    Ok(())
}

/// ## サーバーステータスイベントを発行する
///
/// サーバーの状態を通知するイベントを発行します。
///
/// ### Arguments
/// - `app_handle`: Tauriアプリケーションハンドル
/// - `is_running`: サーバーが実行中かどうか
/// - `ws_url`: WebSocket URL (オプション)
/// - `obs_url`: OBS URL (オプション)
fn emit_server_status(
    app_handle: &tauri::AppHandle,
    is_running: bool,
    ws_url: Option<String>,
    obs_url: Option<String>,
) {
    let status_payload = ServerStatus {
        is_running,
        ws_url,
        obs_url,
    };

    if let Err(e) = app_handle.emit("server_status_updated", status_payload) {
        eprintln!("Failed to emit server_status_updated event: {}", e);
    } else {
        println!(
            "Event 'server_status_updated' emitted with running state: {}",
            is_running
        );
    }
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

/// ## データベースセッションを作成する
///
/// サーバー起動時にデータベースにセッションを作成します。
///
/// ### Arguments
/// - `app_state`: アプリケーション状態
///
/// ### Returns
/// - `Result<i32, String>`: 成功時はセッションID、失敗時はエラーメッセージ
async fn create_database_session(app_state: &AppState) -> Result<i32, String> {
    info!("新しいデータベースセッションを作成します");

    let db_pool = {
        let db_pool_guard = app_state
            .db_pool
            .lock()
            .map_err(|_| "データベースプールのロック取得に失敗しました".to_string())?;

        match &*db_pool_guard {
            Some(pool) => pool.clone(),
            None => return Err("データベース接続がありません".to_string()),
        }
    };

    // セッション作成
    match database::create_session(&db_pool).await {
        Ok(session_id) => {
            info!("新しいセッションを作成しました: ID {}", session_id);
            Ok(session_id)
        }
        Err(e) => {
            let error_msg = format!("セッション作成エラー: {}", e);
            error!("{}", error_msg);
            Err(error_msg)
        }
    }
}

/// ## データベースセッションを終了する
///
/// サーバー停止時にデータベースセッションを終了状態に更新します。
///
/// ### Arguments
/// - `app_handle`: Tauriアプリケーションハンドル
/// - `session_id`: 終了するセッションID
///
/// ### Returns
/// - `Result<(), String>`: 成功時は空のタプル、失敗時はエラーメッセージ
async fn end_database_session(
    app_handle: &tauri::AppHandle,
    session_id: i32,
) -> Result<(), String> {
    info!("セッション{}を終了します", session_id);

    let app_state = app_handle.state::<AppState>();
    let db_pool = {
        let db_pool_guard = app_state
            .db_pool
            .lock()
            .map_err(|_| "データベースプールのロック取得に失敗しました".to_string())?;

        match &*db_pool_guard {
            Some(pool) => pool.clone(),
            None => return Err("データベース接続がありません".to_string()),
        }
    };

    // セッション終了
    match database::end_session(&db_pool, session_id).await {
        Ok(()) => {
            info!("セッション{}を終了しました", session_id);
            Ok(())
        }
        Err(e) => {
            let error_msg = format!("セッション終了エラー: {}", e);
            error!("{}", error_msg);
            Err(error_msg)
        }
    }
}
