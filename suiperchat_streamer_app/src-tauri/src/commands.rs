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
    let runtime_handle_arc = Arc::clone(&app_state.runtime_handle); // runtime_handle もクローン

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

        // --- Tokio ランタイムハンドルを AppState に保存 --- (block_on の前に取得)
        let tokio_handle = rt.handle().clone();
        {
            let mut rt_handle_guard = runtime_handle_arc
                .lock()
                .expect("Failed to lock runtime handle mutex for storing");
            *rt_handle_guard = Some(tokio_handle);
            println!("Tokio runtime handle stored.");
        }

        rt.block_on(async {
            let host = "127.0.0.1"; // TODO: 設定可能にする
            let port = 8080; // TODO: 設定可能にする
            println!("Starting WebSocket server at ws://{}:{}", host, port);

            let server_result =
                HttpServer::new(|| App::new().service(websocket_route)).bind((host, port));

            let server = match server_result {
                Ok(srv) => srv.run(),
                Err(e) => {
                    eprintln!("Failed to bind server: {}", e);
                    // --- バインド失敗時もランタイムハンドルをクリア ---
                    let mut rt_handle_guard = runtime_handle_arc
                        .lock()
                        .expect("Failed to lock runtime handle mutex after bind error");
                    *rt_handle_guard = None;
                    println!("Tokio runtime handle cleared due to bind error.");
                    return;
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
            }
            // --- サーバー終了時 (正常・エラー問わず) に両ハンドルをクリア ---
            println!("WebSocket server finished running. Clearing handles...");
            let mut handle_guard = server_handle_arc
                .lock()
                .expect("Failed to lock server handle mutex after run");
            *handle_guard = None;
            let mut rt_handle_guard = runtime_handle_arc
                .lock()
                .expect("Failed to lock runtime handle mutex after run");
            *rt_handle_guard = None;
            println!("Server and runtime handles cleared.");
        });
        // block_on が終了したら、このスレッドも終了
        println!("WebSocket server thread finished.");
    });

    Ok(())
}

/// ## WebSocket サーバーを停止する Tauri コマンド
///
/// 起動中の WebSocket サーバーを停止します。
/// `AppState` からサーバーハンドルと Tokio ランタイムハンドルを取得して使用します。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
///
/// ### Returns
/// - `Result<(), String>`: 成功した場合は `Ok(())`、エラーの場合はエラーメッセージ
#[command]
pub fn stop_websocket_server(
    app_state: State<AppState>,
    // app_handle は不要になったので削除
) -> Result<(), String> {
    println!("Attempting to stop WebSocket server...");

    let server_handle_option;
    let runtime_handle_option;

    // --- まず ServerHandle を取得 --- (MutexGuard の寿命を短くするため)
    {
        let mut handle_guard = app_state
            .server_handle
            .lock()
            .map_err(|_| "Failed to lock server handle mutex".to_string())?;
        server_handle_option = handle_guard.take(); // take で取得し、AppState 内は None に
    }

    // --- 次に RuntimeHandle を取得 --- (MutexGuard の寿命を短くするため)
    {
        let rt_handle_guard = app_state
            .runtime_handle
            .lock()
            .map_err(|_| "Failed to lock runtime handle mutex".to_string())?;
        // RuntimeHandle は停止時に削除せず、起動スレッド側でクリアするのを待つ
        // 複製して使用する
        runtime_handle_option = rt_handle_guard.clone();
    }

    // --- ハンドルを使ってサーバー停止処理 ---
    if let Some(server_handle) = server_handle_option {
        if let Some(runtime_handle) = runtime_handle_option {
            println!("Stopping WebSocket server using obtained handles...");
            // 取得した Tokio ランタイムハンドルを使ってタスクを spawn
            runtime_handle.spawn(async move {
                println!("Sending stop signal to the server via Tokio runtime handle...");
                server_handle.stop(true).await; // true for graceful shutdown
                println!("Server stop signal sent and awaited.");
            });
            println!("WebSocket server stop initiated.");
            Ok(())
        } else {
            // ServerHandle はあったが RuntimeHandle がなかった場合 (通常は起こらないはず)
            eprintln!("Error: Server handle exists but runtime handle is missing.");
            // 念のため AppState の ServerHandle も None にしておく (take で実施済み)
            Err("Internal error: Runtime handle missing while server handle exists.".to_string())
        }
    } else {
        // ServerHandle が None だった場合 (サーバーは起動していない or 既に停止処理中)
        Err("WebSocket server is not running or already stopping.".to_string())
    }
}

/// ## ウォレットアドレスを設定する Tauri コマンド
///
/// フロントエンドから受け取ったウォレットアドレスを `AppState` に保存します。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
/// - `address`: 設定するウォレットアドレス (`String`)
///
/// ### Returns
/// - `Result<(), String>`: 成功した場合は `Ok(())`、エラーの場合はエラーメッセージ
#[command]
pub fn set_wallet_address(app_state: State<'_, AppState>, address: String) -> Result<(), String> {
    println!("Setting wallet address to: {}", address);

    let trimmed_address = address.trim();

    // --- SUIウォレットアドレス形式のバリデーション ---
    if !trimmed_address.starts_with("0x") {
        return Err("Invalid SUI wallet address: Must start with '0x'.".to_string());
    }
    if trimmed_address.len() != 66 {
        // "0x" + 64 hex characters
        return Err(format!(
            "Invalid SUI wallet address: Expected length 66, got {}.",
            trimmed_address.len()
        ));
    }
    if !trimmed_address[2..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(
            "Invalid SUI wallet address: Contains non-hexadecimal characters after '0x'."
                .to_string(),
        );
    }
    // --- バリデーションここまで ---

    let wallet_address_arc = Arc::clone(&app_state.wallet_address);
    let mut wallet_guard = wallet_address_arc
        .lock()
        .map_err(|_| "Failed to lock wallet address mutex".to_string())?;

    *wallet_guard = Some(address.trim().to_string());

    println!("Wallet address stored in AppState.");
    // TODO: データベースなどへの永続化処理をここに追加

    Ok(())
}
