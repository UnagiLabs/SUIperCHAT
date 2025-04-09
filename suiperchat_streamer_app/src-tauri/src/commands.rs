// このモジュールは Tauri コマンドの実装を含みます

use crate::state::AppState;
use crate::ws_server;
use actix_web::{get, Error, HttpRequest, HttpResponse};
use actix_web::{App, HttpServer};
use actix_web_actors::ws;
use std::sync::Arc;
use tauri::{command, State}; // Manager を追加
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
    // ws_server::WsSession を参照するように修正
    ws::start(ws_server::WsSession::new(), &req, stream)
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
    app_state: State<AppState>,
    _app_handle: tauri::AppHandle, // app_handle は現在未使用だが、将来のために残す
) -> Result<(), String> {
    println!("Attempting to start WebSocket server...");

    let server_handle_arc = Arc::clone(&app_state.server_handle);

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
                return; // ランタイム作成失敗時はスレッド終了
            }
        };

        rt.block_on(async {
            let host = "127.0.0.1"; // TODO: 設定可能にする
            let port = 8080; // TODO: 設定可能にする
            println!("Starting WebSocket server at ws://{}:{}", host, port);

            let server_result = HttpServer::new(|| {
                App::new()
                    // --- websocket_route をサービスとして登録 ---
                    .service(websocket_route)
            })
            .bind((host, port));

            let server = match server_result {
                Ok(srv) => srv.run(),
                Err(e) => {
                    eprintln!("Failed to bind server: {}", e);
                    return; // バインド失敗時は終了
                }
            };

            // サーバーハンドルを状態に保存
            {
                let mut handle_guard = server_handle_arc
                    .lock()
                    .expect("Failed to lock server handle mutex for storing");
                *handle_guard = Some(server.handle());
                println!("WebSocket server started and handle stored.");
            }

            // サーバーを await して実行
            if let Err(e) = server.await {
                eprintln!("WebSocket server run error: {}", e);
                // エラー発生時にハンドルをクリア
                let mut handle_guard = server_handle_arc
                    .lock()
                    .expect("Failed to lock server handle mutex after error");
                *handle_guard = None;
                println!("Server handle cleared due to error.");
            }
            println!("WebSocket server stopped.");
        });
        println!("WebSocket server thread finished.");
    });

    Ok(())
}

/// ## WebSocket サーバーを停止する Tauri コマンド
///
/// 起動中の WebSocket サーバーを停止します。
/// `AppState` からサーバーハンドルを取得して使用します。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
///
/// ### Returns
/// - `Result<(), String>`: 成功した場合は `Ok(())`、エラーの場合はエラーメッセージ
#[command]
pub fn stop_websocket_server(app_state: State<AppState>) -> Result<(), String> {
    println!("Attempting to stop WebSocket server...");

    let mut handle_guard = app_state
        .server_handle
        .lock()
        .map_err(|_| "Failed to lock server handle mutex".to_string())?;

    if let Some(handle) = handle_guard.take() {
        // take() で Option から値を取り出し None にする
        println!("Stopping WebSocket server...");
        // サーバーを停止するためのタスクを生成
        tokio::spawn(async move {
            println!("Sending stop signal to the server...");
            handle.stop(true).await; // true for graceful shutdown
            println!("Server stop signal sent and awaited.");
        });
        println!("WebSocket server stop initiated.");
        Ok(())
    } else {
        Err("WebSocket server is not running.".to_string())
    }
}
