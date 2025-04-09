// このモジュールは Tauri コマンドの実装を含みます

use crate::state::AppState;
use crate::ws_server;
use actix_web::{get, Error, HttpRequest, HttpResponse};
use actix_web::{App, HttpServer};
use actix_web_actors::ws;
use serde::Serialize;
use std::sync::Arc;
use tauri::{command, Emitter, State}; // Emitter と Manager を use
use tokio::runtime::Runtime; // <--- 追加

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
    app_state: State<'_, AppState>,
    _app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!("Attempting to start WebSocket server...");

    let server_handle_arc = Arc::clone(&app_state.server_handle);
    let runtime_handle_arc = Arc::clone(&app_state.runtime_handle);
    let host_arc = Arc::clone(&app_state.host); // <--- host Arc をクローン
    let port_arc = Arc::clone(&app_state.port); // <--- port Arc をクローン

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
            // --- ホストとポートを定義 (将来的には設定から読み込む) ---
            let host = "127.0.0.1";
            let port = 8080;
            println!("Starting WebSocket server at ws://{}:{}", host, port);

            let server_result =
                HttpServer::new(|| App::new().service(websocket_route)).bind((host, port)); // host と port を使用

            match server_result {
                Ok(server) => {
                    // サーバー起動成功時の処理
                    println!("WebSocket server bound successfully to {}:{}", host, port);

                    // --- サーバーを起動して、ハンドルを保存 ---
                    let server = server.run();
                    let server_handle = server.handle(); // このServerインスタンスからハンドルを取得

                    // --- ホストとポートを保存 ---
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

                    // --- サーバーハンドルを保存 --- (一番重要)
                    {
                        let mut handle_guard = server_handle_arc
                            .lock()
                            .expect("Failed to lock server handle mutex for storing");
                        *handle_guard = Some(server_handle);
                        println!("Server handle stored in AppState.");
                    }

                    // ここでサーバーが実行され、.await によってブロックされる
                    if let Err(e) = server.await {
                        eprintln!("WebSocket server error: {}", e);
                    }
                    println!("WebSocket server stopped gracefully.");
                }
                Err(e) => {
                    // 起動失敗時のエラーハンドリング
                    eprintln!("Failed to bind WebSocket server: {}", e);
                }
            }

            // --- サーバー終了時のクリーンアップ処理 ---
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
        // block_on が終了したら、このスレッドも終了
        println!("WebSocket server thread finished.");
    });

    // サーバー起動開始イベントを発行
    _app_handle
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
    app_handle: tauri::AppHandle, // app_handleパラメータを追加
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

            // サーバー停止イベントを発行
            app_handle
                .emit("server_status_updated", false)
                .map_err(|e| {
                    eprintln!("Failed to emit server_status_updated event: {}", e);
                    "Failed to notify frontend about server stop".to_string()
                })?;
            println!("Event 'server_status_updated' emitted for server stop.");

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
/// - `app_handle`: Tauri アプリケーションハンドル (`tauri::AppHandle`)
///
/// ### Returns
/// - `Result<(), String>`: 成功した場合は `Ok(())`、エラーの場合はエラーメッセージ
#[command]
pub fn set_wallet_address(
    app_state: State<'_, AppState>,
    address: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
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

    // --- アドレスを AppState に保存 ---
    let mut wallet_addr = app_state
        .wallet_address
        .lock()
        .map_err(|_| "Failed to lock wallet address mutex".to_string())?;
    *wallet_addr = Some(trimmed_address.to_string());

    // --- イベントを発行 --- ★★★
    // Emitter トレイトの emit メソッドを使用
    app_handle.emit("wallet_address_updated", ()).map_err(|e| {
        eprintln!("Failed to emit wallet_address_updated event: {}", e);
        "Failed to notify frontend about wallet address update".to_string()
    })?;
    println!("Wallet address saved and event 'wallet_address_updated' emitted.");

    Ok(())
}

/// ## フロントエンドに渡す配信者情報
///
/// WebSocketの接続URLと配信者のウォレットアドレスを含みます。
#[derive(Serialize, Clone)] // Serialize と Clone を derive
pub struct StreamerInfo {
    /// WebSocketサーバーの完全なURL (例: "ws://127.0.0.1:8080")
    ws_url: String,
    /// 配信者のSUIウォレットアドレス
    wallet_address: String,
}

/// ## 配信者情報を取得する Tauri コマンド
///
/// 現在設定されている配信者のウォレットアドレスと、
/// 稼働中の（またはデフォルトの）WebSocketサーバーURLを取得して返します。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
///
/// ### Returns
/// - `Result<StreamerInfo, String>`: 成功した場合は `StreamerInfo`、失敗した場合はエラーメッセージ
#[command]
pub fn get_streamer_info(app_state: State<'_, AppState>) -> Result<StreamerInfo, String> {
    println!("Getting streamer info...");

    // --- ウォレットアドレスを取得 ---
    let wallet_addr_guard = app_state
        .wallet_address
        .lock()
        .map_err(|_| "Failed to lock wallet address mutex".to_string())?;
    let wallet_address = wallet_addr_guard
        .as_ref()
        .ok_or_else(|| "Wallet address is not set. Please configure it first.".to_string())?
        .clone();

    // --- WebSocket URLをAppStateから構築 ---
    let host_guard = app_state
        .host
        .lock()
        .map_err(|_| "Failed to lock host mutex".to_string())?;
    let host = host_guard.as_ref().ok_or_else(|| {
        "WebSocket server host is not available (server not running?).".to_string()
    })?;

    let port_guard = app_state
        .port
        .lock()
        .map_err(|_| "Failed to lock port mutex".to_string())?;
    let port = port_guard.ok_or_else(|| {
        "WebSocket server port is not available (server not running?).".to_string()
    })?;

    // WebSocket URL を構築
    let ws_url = format!("ws://{}:{}", host, port);
    println!("Constructed ws_url from AppState: {}", ws_url);

    Ok(StreamerInfo {
        ws_url,
        wallet_address,
    })
}
