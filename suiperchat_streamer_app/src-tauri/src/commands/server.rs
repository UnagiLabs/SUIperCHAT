//! WebSocketサーバー関連のコマンド
//!
//! サーバーの起動・停止・状態管理を行うコマンドを提供します。

use crate::state::AppState;
use crate::ws_server::connection_manager::global::set_app_handle;
use actix_files as fs;
use actix_web::{get, web, App, Error, HttpRequest, HttpResponse, HttpServer}; // ServerHandle を actix_web::dev から use
use actix_web_actors::ws;
use std::path::PathBuf;
use std::sync::Arc;
use tokio; // tokioを追加
use tauri::{command, Emitter, State};
use tokio::runtime::Runtime;

/// ## WebSocket ルートハンドラー
///
/// WebSocket 接続リクエストを処理し、`WsSession` アクターを開始します。
///
/// ### Arguments
/// - `req`: HTTPリクエスト (`HttpRequest`)
/// - `stream`: ペイロードストリーム (`actix_web::web::Payload`)
///
/// ### Returns
/// - `Result<HttpResponse, Error>`: WebSocket ハンドシェイク応答 or エラー
#[get("/ws")]
async fn websocket_route(
    req: HttpRequest,
    stream: actix_web::web::Payload,
) -> Result<HttpResponse, Error> {
    println!("Received websocket upgrade request");
    ws::start(
        crate::ws_server::create_ws_session(req.clone()),
        &req,
        stream,
    )
}

/// ## OBSステータスページハンドラー
///
/// OBS用のステータス情報ページを提供するハンドラー
///
/// ### Returns
/// - `HttpResponse`: HTML形式のステータスページ
#[get("/status")]
async fn status_page() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(include_str!("../../src/static/obs/status.html"))
}

/// ## 静的ファイルパスを解決する
///
/// 環境に応じて適切な静的ファイルのパスを返します。
/// 開発環境では `src-tauri/src/static` を、
/// 本番環境では実行ファイルのディレクトリの `src/static` を使用します。
///
/// ### Returns
/// - `PathBuf`: 静的ファイルのルートパス
fn resolve_static_file_path() -> PathBuf {
    // 開発環境かどうかのチェック
    if cfg!(debug_assertions) {
        // カレントディレクトリからの相対パスを試みる
        let dev_path = PathBuf::from("./src-tauri/src/static");
        if dev_path.exists() {
            println!("Using development static path: {}", dev_path.display());
            return dev_path;
        }

        // Cargo.tomlからの相対パスを試みる
        let cargo_path = PathBuf::from("./src/static");
        if cargo_path.exists() {
            println!("Using Cargo relative static path: {}", cargo_path.display());
            return cargo_path;
        }
    }

    // 実行ファイルからの相対パスを使用（主に本番環境用）
    let exe_path = std::env::current_exe()
        .ok()
        .and_then(|exe_path| exe_path.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let static_path = exe_path.join("src/static");
    println!(
        "Using executable relative static path: {}",
        static_path.display()
    );
    static_path
}

/// ## WebSocket サーバーを起動する Tauri コマンド
///
/// 指定されたホストとポートで WebSocket サーバーを非同期に起動します。
/// サーバーハンドルを `AppState` に保存します。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
/// - `app_handle`: Tauri アプリケーションハンドル (`tauri::AppHandle`)
///
/// ### Returns
/// - `Result<(), String>`: 成功した場合は `Ok(())`、エラーの場合はエラーメッセージ
#[command]
pub fn start_websocket_server(
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!("Attempting to start WebSocket server...");

    // 接続マネージャーにアプリケーションハンドルを設定
    set_app_handle(app_handle.clone());

    let server_handle_arc = Arc::clone(&app_state.server_handle);
    let runtime_handle_arc = Arc::clone(&app_state.runtime_handle);
    let host_arc = Arc::clone(&app_state.host);
    let port_arc = Arc::clone(&app_state.port);

    // 既にサーバーが起動しているかチェック
    {
        let handle_guard = server_handle_arc
            .lock()
            .map_err(|_| "Failed to lock server handle mutex for checking".to_string())?;
        if handle_guard.is_some() {
            return Err("WebSocket server is already running.".to_string());
        }
    }

    // サーバーを別スレッドで起動
    std::thread::spawn(move || {
        let rt = match Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                eprintln!("Failed to create Tokio runtime: {}", e);
                return;
            }
        };

        let tokio_handle = rt.handle().clone();
        {
            let mut rt_handle_guard = runtime_handle_arc
                .lock()
                .expect("Failed to lock runtime handle mutex for storing");
            *rt_handle_guard = Some(tokio_handle);
            println!("Tokio runtime handle stored.");
        }

        rt.block_on(async {
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
                        web::route()
                            .to(|| async { HttpResponse::NotFound().body("404 Not Found") }),
                    )
            })
            .bind((host, ws_port));

            // OBS用静的ファイルサーバーを作成
            let obs_path_clone = obs_path.clone();
            let obs_server_result = HttpServer::new(move || {
                App::new()
                    // ステータスページ
                    .service(status_page)
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
                        web::route()
                            .to(|| async { HttpResponse::NotFound().body("404 Not Found") }),
                    )
            })
            .bind((host, obs_port));

            // WebSocketサーバーとOBSサーバーのバインド結果を評価
            match (websocket_server_result, obs_server_result) {
                (Ok(ws_server), Ok(obs_server)) => {
                    // 両方のサーバーが正常にバインドされた場合
                    println!("Both WebSocket and OBS servers bound successfully.");
                    println!(
                        "WebSocket server listening on ws://{}:{}{}",
                        host, ws_port, ws_path
                    );
                    println!(
                        "OBS server listening on http://{}:{}/obs/",
                        host, obs_port
                    );

                    // WebSocketサーバーの実行インスタンス (Server型) を取得
                    let ws_server_runner = ws_server.run();
                    // ハンドルは Server インスタンスから取得
                    let server_handle = ws_server_runner.handle(); // ここでハンドルを取得

                    // AppStateにハンドルなどを保存
                    {
                        let mut handle_guard = server_handle_arc
                            .lock()
                            .expect("Failed to lock server handle mutex for storing");
                        *handle_guard = Some(server_handle); // 取得したハンドルを保存 (clone不要のはず)
                        println!("WebSocket server handle stored in AppState.");
                    }
                    {
                        let mut host_guard = host_arc
                            .lock()
                            .expect("Failed to lock host mutex for storing");
                        *host_guard = Some(host.to_string());
                        println!("Host stored in AppState: {}", host);
                    }
                    {
                        let mut port_guard = port_arc
                            .lock()
                            .expect("Failed to lock port mutex for storing");
                        *port_guard = Some(ws_port); // WebSocketのポートを保存
                        println!("WebSocket Port stored in AppState: {}", ws_port);
                    }

                    // OBSサーバーの実行インスタンスを取得
                    let obs_server_runner = obs_server.run();

                    // 両方のサーバーを並行して実行するためのFutureを取得
                    let ws_server_future = ws_server_runner; // Server は Future を実装
                    let obs_server_future = obs_server_runner; // Server は Future を実装

                    println!("Starting both servers concurrently using tokio::try_join!...");
                    // try_join! で両方のサーバーを実行し、どちらかがエラーを返すか両方が完了するまで待機
                    if let Err(e) = tokio::try_join!(ws_server_future, obs_server_future) {
                        eprintln!("Server execution error in try_join!: {}", e);
                    } else {
                        println!("Both servers joined successfully and stopped gracefully.");
                    }
                }
                (Ok(_ws_server_ok), Err(e_obs)) => {
                    // OBSサーバーのバインドに失敗した場合
                    eprintln!("Failed to bind OBS server: {}", e_obs);
                    eprintln!("WebSocket server bound successfully, but will not start because OBS server failed to bind.");
                    // ここでWebSocketサーバーのみを起動する選択肢も検討可能ですが、今回は両方起動しない方針とします。
                }
                (Err(e_ws), Ok(_obs_server_ok)) => {
                    // WebSocketサーバーのバインドに失敗した場合
                    eprintln!("Failed to bind WebSocket server: {}", e_ws);
                    eprintln!("OBS server bound successfully, but will not start because WebSocket server failed to bind.");
                    // ここでOBSサーバーのみを起動する選択肢も検討可能ですが、今回は両方起動しない方針とします。
                }
                (Err(e_ws), Err(e_obs)) => {
                    // 両方のサーバーのバインドに失敗した場合
                    eprintln!("Failed to bind WebSocket server: {}", e_ws);
                    eprintln!("Failed to bind OBS server: {}", e_obs);
                    eprintln!("Neither server will start.");
                }
            }

            // クリーンアップ処理
            let mut handle_guard = server_handle_arc
                .lock()
                .expect("Failed to lock server handle after run");
            *handle_guard = None;
            let mut rt_handle_guard = runtime_handle_arc
                .lock()
                .expect("Failed to lock runtime handle after run");
            *rt_handle_guard = None;
            let mut host_guard = host_arc.lock().expect("Failed to lock host after run");
            *host_guard = None;
            let mut port_guard = port_arc.lock().expect("Failed to lock port after run");
            *port_guard = None;
            println!("Server handle, runtime handle, host, and port cleared.");
        });
        println!("WebSocket server thread finished.");
    });

    // サーバー起動開始イベントを発行
    app_handle
        .emit("server_status_updated", true)
        .map_err(|e| {
            eprintln!("Failed to emit server_status_updated event: {}", e);
            "Failed to notify frontend about server start".to_string()
        })?;
    println!("Server start initiated and event 'server_status_updated' emitted.");

    Ok(())
}

/// ## WebSocket サーバーを停止する Tauri コマンド
///
/// 起動中の WebSocket サーバーを停止します。
/// `AppState` からサーバーハンドルと Tokio ランタイムハンドルを取得して使用します。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
/// - `app_handle`: Tauri アプリケーションハンドル (`tauri::AppHandle`)
///
/// ### Returns
/// - `Result<(), String>`: 成功した場合は `Ok(())`、エラーの場合はエラーメッセージ
#[command]
pub fn stop_websocket_server(
    app_state: State<AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!("Attempting to stop WebSocket server...");

    let server_handle_option;
    let runtime_handle_option;

    {
        let mut handle_guard = app_state
            .server_handle
            .lock()
            .map_err(|_| "Failed to lock server handle mutex".to_string())?;
        server_handle_option = handle_guard.take();
    }

    {
        let rt_handle_guard = app_state
            .runtime_handle
            .lock()
            .map_err(|_| "Failed to lock runtime handle mutex".to_string())?;
        runtime_handle_option = rt_handle_guard.clone();
    }

    if let Some(server_handle) = server_handle_option {
        if let Some(runtime_handle) = runtime_handle_option {
            println!("Stopping WebSocket server using obtained handles...");
            runtime_handle.spawn(async move {
                println!("Sending stop signal to the server via Tokio runtime handle...");
                server_handle.stop(true).await;
                println!("Server stop signal sent and awaited.");
            });
            println!("WebSocket server stop initiated.");

            app_handle
                .emit("server_status_updated", false)
                .map_err(|e| {
                    eprintln!("Failed to emit server_status_updated event: {}", e);
                    "Failed to notify frontend about server stop".to_string()
                })?;
            println!("Event 'server_status_updated' emitted for server stop.");

            Ok(())
        } else {
            eprintln!("Error: Server handle exists but runtime handle is missing.");
            Err("Internal error: Runtime handle missing while server handle exists.".to_string())
        }
    } else {
        Err("WebSocket server is not running or already stopping.".to_string())
    }
}
