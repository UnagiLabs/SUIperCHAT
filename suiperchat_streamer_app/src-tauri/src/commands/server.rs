//! WebSocketサーバー関連のコマンド
//!
//! サーバーの起動・停止・状態管理を行うコマンドを提供します。

use crate::state::AppState;
use crate::ws_server::connection_manager::global::set_app_handle;
use actix_web::{get, App, Error, HttpRequest, HttpResponse, HttpServer};
use actix_web_actors::ws;
use std::sync::Arc;
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
            let port = 8080;
            let ws_path = "/ws";
            println!(
                "Starting WebSocket server at ws://{}:{}{}",
                host, port, ws_path
            );
            println!("Note: Client connections MUST include the '/ws' path");

            let server_result =
                HttpServer::new(|| App::new().service(websocket_route)).bind((host, port));

            match server_result {
                Ok(server) => {
                    println!("WebSocket server bound successfully to {}:{}", host, port);
                    println!("Full WebSocket endpoint: ws://{}:{}{}", host, port, ws_path);

                    let server = server.run();
                    let server_handle = server.handle();

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
                        *port_guard = Some(port);
                        println!("Port stored in AppState: {}", port);
                    }

                    {
                        let mut handle_guard = server_handle_arc
                            .lock()
                            .expect("Failed to lock server handle mutex for storing");
                        *handle_guard = Some(server_handle);
                        println!("Server handle stored in AppState.");
                    }

                    if let Err(e) = server.await {
                        eprintln!("WebSocket server error: {}", e);
                    }
                    println!("WebSocket server stopped gracefully.");
                }
                Err(e) => {
                    eprintln!("Failed to bind WebSocket server: {}", e);
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
