/**
 * サーバー制御コマンド
 *
 * WebSocketサーバーの起動・停止を制御するコマンドを提供します。
 * フロントエンドからバックグラウンドのサーバー操作を可能にします。
 *
 * @module commands/server
 */
use crate::websocket::server::WebSocketServer;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

// グローバルなWebSocketサーバーインスタンス
lazy_static::lazy_static! {
    static ref WS_SERVER: Arc<TokioMutex<Option<WebSocketServer>>> = Arc::new(TokioMutex::new(None));
}

/// サーバー状態レスポンス
#[derive(Serialize)]
pub struct ServerStatusResponse {
    /// サーバーが実行中かどうか
    is_running: bool,
    /// サーバーのポート番号
    port: Option<u16>,
    /// サーバーのホスト名
    host: Option<String>,
    /// メッセージ（エラーまたは成功）
    message: String,
}

/// サーバー起動リクエスト
#[derive(Deserialize)]
pub struct ServerStartRequest {
    /// サーバーを起動するポート番号
    port: Option<u16>,
    /// サーバーのホスト名（デフォルト: localhost）
    host: Option<String>,
}

/// WebSocketサーバーを起動するコマンド
///
/// # 引数
///
/// * `request` - サーバー起動パラメータを含むリクエスト
///
/// # 戻り値
///
/// * `ServerStatusResponse` - サーバーの起動状態を含むレスポンス
///
/// # 例
///
/// ```typescript
/// // フロントエンド側の呼び出し例
/// const response = await invoke('start_server', { port: 8080 });
/// if (response.is_running) {
///   console.log(`サーバーが起動しました: ${response.host}:${response.port}`);
/// }
/// ```
#[tauri::command]
pub async fn start_server(request: ServerStartRequest) -> ServerStatusResponse {
    // デフォルト値の設定
    let port = request.port.unwrap_or(8080);
    let host = request.host.unwrap_or_else(|| "localhost".to_string());

    // サーバーの状態をチェック
    let mut server_guard = WS_SERVER.lock().await;

    // サーバーがすでに起動している場合
    if let Some(server) = server_guard.as_ref() {
        if server.is_running() {
            return ServerStatusResponse {
                is_running: true,
                port: Some(server.port),
                host: Some(server.host.clone()),
                message: format!(
                    "サーバーはすでに起動しています ({}:{})",
                    server.host, server.port
                ),
            };
        }
    }

    // 新しいWebSocketサーバーインスタンスを作成
    let mut server = WebSocketServer::new(host.clone(), port);

    // サーバーを起動
    match server.start().await {
        Ok(_) => {
            // グローバル変数にサーバーインスタンスを保存
            *server_guard = Some(server);

            ServerStatusResponse {
                is_running: true,
                port: Some(port),
                host: Some(host.clone()),
                message: format!("WebSocketサーバーの起動に成功しました ({}:{})", host, port),
            }
        }
        Err(e) => ServerStatusResponse {
            is_running: false,
            port: None,
            host: None,
            message: format!("WebSocketサーバーの起動に失敗しました: {}", e),
        },
    }
}

/// WebSocketサーバーを停止するコマンド
///
/// # 戻り値
///
/// * `ServerStatusResponse` - サーバーの停止状態を含むレスポンス
///
/// # 例
///
/// ```typescript
/// // フロントエンド側の呼び出し例
/// const response = await invoke('stop_server');
/// console.log(response.message); // "サーバーを停止しました"
/// ```
#[tauri::command]
pub async fn stop_server() -> ServerStatusResponse {
    // グローバル変数からサーバーインスタンスを取得
    let mut server_guard = WS_SERVER.lock().await;

    // サーバーが存在しない場合
    if server_guard.is_none() {
        return ServerStatusResponse {
            is_running: false,
            port: None,
            host: None,
            message: "サーバーは起動していません".to_string(),
        };
    }

    // サーバーが存在する場合
    let mut server = server_guard.take().unwrap();

    // サーバーを停止
    match server.stop().await {
        Ok(_) => ServerStatusResponse {
            is_running: false,
            port: None,
            host: None,
            message: "WebSocketサーバーを停止しました".to_string(),
        },
        Err(e) => {
            // エラーが発生した場合でもインスタンスは削除
            ServerStatusResponse {
                is_running: false,
                port: None,
                host: None,
                message: format!("WebSocketサーバーの停止中にエラーが発生しました: {}", e),
            }
        }
    }
}
