//! WebSocketサーバー関連のコマンド
//!
//! サーバーの起動・停止・状態管理を行うコマンドを提供します。

use crate::state::AppState;
use crate::types::ServerStatus; // ServerStatus をインポート
use crate::ws_server::connection_manager::global::set_app_handle;
use actix_files as fs;
use actix_web::{dev::ServerHandle, get, web, App, Error, HttpRequest, HttpResponse, HttpServer}; // ServerHandle をインポート
use actix_web_actors::ws;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{command, Emitter, State}; // Manager をインポート
use tokio::runtime::{Handle as TokioHandle, Runtime}; // TokioHandle を明示的にインポート

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
    let app_handle_clone = app_handle.clone(); // イベント発行用にクローン
    println!("Attempting to start WebSocket server...");

    // 接続マネージャーにアプリケーションハンドルを設定
    set_app_handle(app_handle.clone());

    let server_handle_arc = Arc::clone(&app_state.server_handle);
    let runtime_handle_arc = Arc::clone(&app_state.runtime_handle);
    // host, port arcを追加
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
            if let Some((_ws_handle, _obs_handle)) = handle_guard.as_ref() {
                if let (Some(ws_url), Some(obs_url)) =
                    (
                        app_state.host.lock().unwrap().as_ref().and_then(|h| {
                            app_state.port.lock().unwrap().as_ref().map(|p| {
                                let addr = SocketAddr::new(
                                    h.parse().unwrap_or(std::net::IpAddr::V4(
                                        std::net::Ipv4Addr::new(127, 0, 0, 1),
                                    )),
                                    *p,
                                );
                                format_socket_addr(&addr, "ws", "/ws")
                            })
                        }),
                        app_state.host.lock().unwrap().as_ref().and_then(|h| {
                            app_state.port.lock().unwrap().map(|_p| {
                                let addr = SocketAddr::new(
                                    h.parse().unwrap_or(std::net::IpAddr::V4(
                                        std::net::Ipv4Addr::new(127, 0, 0, 1),
                                    )),
                                    8081,
                                );
                                format_socket_addr(&addr, "http", "/obs/")
                            })
                        }),
                    )
                {
                    let status_payload = ServerStatus {
                        is_running: true,
                        obs_url: Some(obs_url),
                        ws_url: Some(ws_url),
                    };
                    if let Err(e) = app_handle_clone.emit("server_status_updated", status_payload) {
                        eprintln!(
                            "Failed to re-emit server_status_updated (already running) event: {}",
                            e
                        );
                    }
                }
            }
            return Err("WebSocket server is already running.".to_string());
        }
    }

    // サーバーを別スレッドで起動
    std::thread::spawn(move || {
        let rt = match Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                eprintln!("Failed to create Tokio runtime: {}", e);
                // 起動失敗イベントを発行
                let status_payload_fail = ServerStatus {
                    is_running: false,
                    obs_url: None,
                    ws_url: None,
                };
                if let Err(e_emit) =
                    app_handle_clone.emit("server_status_updated", status_payload_fail)
                {
                    eprintln!(
                        "Failed to emit server_status_updated (runtime creation failed) event: {}",
                        e_emit
                    );
                }
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

                    // バインドされたアドレスを取得
                    let ws_addrs = ws_server.addrs();
                    let obs_addrs = obs_server.addrs();

                    println!("WS Addrs: {:?}", ws_addrs);
                    println!("OBS Addrs: {:?}", obs_addrs);

                    let ws_addr_str = ws_addrs
                        .first()
                        .map(|addr| format_socket_addr(addr, "ws", "/ws"))
                        .unwrap_or_else(|| format!("ws://{}:{}{}", host, ws_port, ws_path)); // フォールバック

                    let obs_addr_str = obs_addrs
                        .first()
                        .map(|addr| format_socket_addr(addr, "http", "/obs/"))
                        .unwrap_or_else(|| format!("http://{}:{}/obs/", host, obs_port)); // フォールバック

                    println!("Generated WebSocket URL: {}", ws_addr_str);
                    println!("Generated OBS URL: {}", obs_addr_str);

                    // WebSocketサーバーの実行インスタンス (Server型) を取得
                    let ws_server_runner = ws_server.run();
                    let server_handle = ws_server_runner.handle(); // ハンドル取得

                    // OBSサーバーの実行インスタンスを取得
                    let obs_server_runner = obs_server.run();
                    let obs_server_handle = obs_server_runner.handle(); // OBSサーバーのハンドルも取得（停止用）

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

                    // サーバー起動成功イベントを発行
                    let status_payload = ServerStatus {
                        is_running: true,
                        obs_url: Some(obs_addr_str),
                        ws_url: Some(ws_addr_str),
                    };
                    if let Err(e) = app_handle_clone.emit("server_status_updated", status_payload) {
                        eprintln!(
                            "Failed to emit server_status_updated (running) event: {}",
                            e
                        );
                    } else {
                        println!("Event 'server_status_updated' (running) emitted.");
                    }

                    // 両方のサーバーを並行して実行
                    println!("Starting both servers concurrently using tokio::try_join!...");
                    if let Err(e) = tokio::try_join!(ws_server_runner, obs_server_runner) {
                        eprintln!("Server execution error in try_join!: {}", e);
                        // エラーが発生した場合も停止イベントを発行すべき
                        let status_payload_stop = ServerStatus {
                            is_running: false,
                            obs_url: None,
                            ws_url: None,
                        };
                        if let Err(e_emit) =
                            app_handle_clone.emit("server_status_updated", status_payload_stop)
                        {
                            eprintln!(
                                "Failed to emit server_status_updated (join error) event: {}",
                                e_emit
                            );
                        }
                    } else {
                        println!("Both servers joined successfully and stopped gracefully.");
                        // 正常終了時にも停止イベントを発行
                        let status_payload_stop = ServerStatus {
                            is_running: false,
                            obs_url: None,
                            ws_url: None,
                        };
                        if let Err(e_emit) =
                            app_handle_clone.emit("server_status_updated", status_payload_stop)
                        {
                            eprintln!(
                                "Failed to emit server_status_updated (graceful stop) event: {}",
                                e_emit
                            );
                        }
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
                    let status_payload = ServerStatus {
                        is_running: false,
                        obs_url: None,
                        ws_url: None,
                    };
                    if let Err(e) = app_handle_clone.emit("server_status_updated", status_payload) {
                        eprintln!("Failed to emit server_status_updated (failed) event: {}", e);
                    } else {
                        println!("Event 'server_status_updated' (failed) emitted.");
                    }
                }
            }

            // クリーンアップ処理 (サーバーが停止した後に実行される)
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
            // hostとportもクリア
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
        });
        println!("Server thread finished.");
    });

    // 注: イベント発行は非同期ブロック内でサーバーバインド成功/失敗後に行うため、ここでの発行は削除

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

    // let server_handle_option; // 不要な行を削除
    let server_handles_option: Option<(ServerHandle, ServerHandle)>; // 型アノテーションを追加
    let runtime_handle_option: Option<TokioHandle>; // こちらも型アノテーションを追加

    {
        let mut handle_guard = app_state
            .server_handle // Mutex<(Option<(ServerHandle, ServerHandle)>)>
            .lock()
            .map_err(|_| "Failed to lock server handle mutex".to_string())?;
        server_handles_option = handle_guard.take(); // Option<(ServerHandle, ServerHandle)> を取得
    }

    {
        let mut rt_handle_guard = app_state
            .runtime_handle // Mutex<Option<tokio::runtime::Handle>>
            .lock()
            .map_err(|_| "Failed to lock runtime handle mutex".to_string())?;
        // ランタイムハンドルは停止に必要なので、cloneせずにtakeする
        runtime_handle_option = rt_handle_guard.take();
    }

    if let Some((ws_server_handle, obs_server_handle)) = server_handles_option {
        if let Some(runtime_handle) = runtime_handle_option {
            println!("Stopping WebSocket and OBS servers using obtained handles...");

            // ホストとポートをクリア（停止コマンド呼び出し後）
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

            // 両方のサーバーを停止するタスクをspawn
            let app_handle_clone = app_handle.clone(); // appハンドルのクローンを作成して非同期ブロックに渡す
            runtime_handle.spawn(async move {
                println!("Sending stop signal to WS and OBS servers via Tokio runtime handle...");
                // 両方の stop を並行して実行
                let ws_stop = ws_server_handle.stop(true);
                let obs_stop = obs_server_handle.stop(true);
                tokio::join!(ws_stop, obs_stop); // join! で両方の停止を待つ
                println!("Both server stop signals sent and awaited.");

                // サーバー停止成功イベントを発行 (非同期ブロック内で発行)
                let status_payload = ServerStatus {
                    is_running: false,
                    obs_url: None,
                    ws_url: None,
                };
                if let Err(e) = app_handle_clone.emit("server_status_updated", status_payload) {
                    eprintln!(
                        "Failed to emit server_status_updated (stopped) event: {}",
                        e
                    );
                } else {
                    println!("Event 'server_status_updated' (stopped) emitted.");
                }
            });
            println!("Server stop initiated.");

            Ok(())
        } else {
            eprintln!("Error: Server handles exist but runtime handle is missing.");
            // 停止できなかったサーバーハンドルを戻す試み (エラーハンドリング改善)
            {
                let mut handle_guard = app_state
                    .server_handle
                    .lock()
                    .expect("Failed to re-lock server handle mutex");
                *handle_guard = Some((ws_server_handle, obs_server_handle)); // タプルを戻す
                                                                             // ランタイムハンドルも戻す必要があるかもしれないが、takeしたので難しい
                                                                             // 本来はruntime_handleがNoneの時点でエラーにすべき
            }
            // エラーメッセージをより具体的に
            Err("Internal error: Runtime handle missing, cannot stop servers.".to_string())
        }
    } else {
        println!("Server is not running or already stopped.");
        // サーバーが起動していない場合も停止イベント（is_running: false）を送信する
        let status_payload = ServerStatus {
            is_running: false,
            obs_url: None,
            ws_url: None,
        };
        // app_handle は move されていないので利用可能
        if let Err(e) = app_handle.emit("server_status_updated", status_payload) {
            eprintln!(
                "Failed to emit server_status_updated (already stopped) event: {}",
                e
            );
        }
        // サーバーが起動していないことを明確にするエラーメッセージ
        Err("Server not running.".to_string())
    }
}

/// ## SocketAddr を URL 文字列にフォーマットするヘルパー関数
///
/// `0.0.0.0` を `127.0.0.1` に置換し、指定されたスキーマとパスで完全なURLを生成します。
fn format_socket_addr(addr: &SocketAddr, schema: &str, path: &str) -> String {
    let ip = match addr.ip() {
        std::net::IpAddr::V4(ip) if ip.is_unspecified() => "127.0.0.1".to_string(),
        ip => ip.to_string(),
    };
    format!("{}://{}:{}{}", schema, ip, addr.port(), path)
}
