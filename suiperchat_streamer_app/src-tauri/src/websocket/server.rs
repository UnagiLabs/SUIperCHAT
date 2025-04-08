/**
 * WebSocketサーバー実装
 *
 * WebSocketプロトコルを用いたサーバーを提供します。
 * 接続管理、メッセージの送受信、イベント処理を担当します。
 *
 * @module websocket/server
 */
use crate::websocket::client::{
    add_client, broadcast_message, generate_client_id, new_clients_map, remove_client, ClientsMap,
};
use crate::websocket::message::{ConnectionResponse, WebSocketMessage};
use futures_channel::mpsc::unbounded;
use futures_util::{stream::TryStreamExt, SinkExt, StreamExt};
use log::{error, info};
use serde_json::json;
use std::io;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tokio_tungstenite::{
    accept_async,
    tungstenite::{Error, Message, Result},
};

/// サーバー状態
pub struct WebSocketServer {
    /// サーバーが実行中かどうか
    pub is_running: Arc<Mutex<bool>>,
    /// サーバーのホスト名
    pub host: String,
    /// サーバーのポート番号
    pub port: u16,
    /// 接続されたクライアント
    pub clients: ClientsMap,
    /// サーバー停止用シグナル送信機
    pub shutdown_sender: Option<oneshot::Sender<()>>,
}

impl WebSocketServer {
    /// 新しいWebSocketサーバーインスタンスを作成
    pub fn new(host: String, port: u16) -> Self {
        Self {
            is_running: Arc::new(Mutex::new(false)),
            host,
            port,
            clients: new_clients_map(),
            shutdown_sender: None,
        }
    }

    /// WebSocketサーバーを起動
    ///
    /// # 戻り値
    ///
    /// * `Result<()>` - サーバーの起動が成功したかどうかの結果。
    ///
    /// エラーの場合、具体的な `tokio_tungstenite::tungstenite::Error` を返します。
    pub async fn start(&mut self) -> Result<()> {
        // サーバーのアドレスを構築
        let addr_str = format!("{}:{}", self.host, self.port);
        let addr = addr_str
            .parse::<SocketAddr>()
            // アドレス解析失敗時は I/O エラー (InvalidInput) とする
            .map_err(|e| {
                error!("アドレス '{}' の解析に失敗: {}", addr_str, e);
                Error::Io(io::Error::new(io::ErrorKind::InvalidInput, e))
            })?;

        // TCPリスナーを作成
        let listener = TcpListener::bind(&addr).await.map_err(|e| {
            error!("{}:{} へのバインドに失敗: {}", self.host, self.port, e);
            // 具体的な I/O エラーを返す
            Error::Io(e)
        })?;

        info!("WebSocketサーバーを起動しました: {}", addr);

        // 実行状態を更新
        if let Ok(mut is_running) = self.is_running.lock() {
            *is_running = true;
        }

        // シャットダウン用のチャネルを作成
        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
        self.shutdown_sender = Some(shutdown_tx);

        // クライアントマップのクローンを作成
        let clients = self.clients.clone();

        // 接続受付ループをTokioタスクとして実行
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    // 新しい接続を受け入れた場合
                    accept_result = listener.accept() => {
                        match accept_result {
                            Ok((stream, addr)) => {
                                info!("新しい接続: {}", addr);
                                // 新しい接続を処理
                                let clients_clone = clients.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_connection(stream, clients_clone).await {
                                        error!("接続処理エラー ({}): {}", addr, e);
                                    }
                                });
                            }
                            Err(e) => {
                                error!("接続受付エラー: {}", e);
                                break;
                            }
                        }
                    }
                    // 停止シグナルを受信した場合
                    _ = &mut shutdown_rx => {
                        info!("停止シグナルを受信しました");
                        break;
                    }
                };
            }

            info!("WebSocketサーバーを停止しました");
        });

        Ok(())
    }

    /// WebSocketサーバーを停止
    pub async fn stop(&mut self) -> Result<()> {
        info!("WebSocketサーバーの停止を開始...");

        // 停止シグナルを送信
        if let Some(shutdown_tx) = self.shutdown_sender.take() {
            let _ = shutdown_tx.send(());
        }

        // 実行状態を更新
        if let Ok(mut is_running) = self.is_running.lock() {
            *is_running = false;
        }

        // システムメッセージをブロードキャスト
        let system_msg = WebSocketMessage::new_system("サーバーが停止しました".to_string());
        let json_msg = serde_json::to_string(&system_msg).unwrap_or_default();
        broadcast_message(&self.clients, Message::Text(json_msg.into()));

        info!("WebSocketサーバーの停止が完了しました");
        Ok(())
    }

    /// サーバーの状態を取得
    pub fn is_running(&self) -> bool {
        self.is_running.lock().map(|guard| *guard).unwrap_or(false)
    }
}

/// WebSocket接続を処理
async fn handle_connection(stream: TcpStream, clients: ClientsMap) -> Result<()> {
    let addr = stream.peer_addr().map_err(|_| Error::ConnectionClosed)?;

    // WebSocketハンドシェイクを実行
    let ws_stream = accept_async(stream)
        .await
        .map_err(|_| Error::ConnectionClosed)?;

    info!("WebSocket接続が確立されました: {}", addr);

    // クライアントIDを生成
    let client_id = generate_client_id();
    let client_id_for_log = client_id.clone(); // ログ用にクローン

    // 送受信チャネルを作成
    let (mut ws_sender, ws_receiver) = ws_stream.split();
    let (tx, _rx) = unbounded();
    let tx_clone = tx.clone(); // 追加: tx のクローン

    // クライアント追加
    add_client(&clients, client_id.clone(), tx, None);

    // 接続成功レスポンスを送信
    let response = ConnectionResponse {
        success: true,
        client_id: client_id.clone(),
        message: "WebSocket接続が確立されました".to_string(),
    };
    let response_json = serde_json::to_string(&response).map_err(|e| {
        error!("JSONシリアライズに失敗: {}", e);
        Error::ConnectionClosed
    })?;

    // 接続応答メッセージを送信するフューチャー
    let connection_send = ws_sender.send(Message::Text(response_json.into())).await;
    if let Err(e) = connection_send {
        error!("接続応答の送信に失敗: {}", e);
        remove_client(&clients, &client_id_for_log);
        return Err(e);
    }

    // 受信したメッセージを処理するフューチャー
    let clients_clone = clients.clone(); // 追加: clients のクローン
    let client_id_for_closure = client_id.clone(); // クロージャ用にクローン

    let receive_from_client = ws_receiver.try_for_each(move |msg| {
        let client_id_clone = client_id_for_closure.clone();
        let clients_for_closure = clients_clone.clone(); // クロージャ内で使用するためのクローン
        let tx_for_closure = tx_clone.clone(); // クロージャ内で使用するためのクローン

        async move {
            info!("メッセージを受信: {} から {:?}", client_id_clone, msg);

            // テキストメッセージのみ処理
            if let Message::Text(text) = msg {
                // JSONをパース
                if let Ok(ws_msg) = serde_json::from_str::<WebSocketMessage>(&text) {
                    // WebSocketMessageをJSON文字列に変換して送信
                    if let Ok(json_msg) = serde_json::to_string(&ws_msg) {
                        broadcast_message(&clients_for_closure, Message::Text(json_msg.into()));
                    }
                } else {
                    // JSONパースに失敗した場合はエラーメッセージを送信
                    let error_msg = json!({
                        "error": "無効なメッセージ形式です"
                    });
                    let _ =
                        tx_for_closure.unbounded_send(Message::Text(error_msg.to_string().into()));
                }
            }

            Ok(())
        }
    });

    // エラーが発生するか、クライアントが切断するまで処理を継続
    tokio::select! {
        result = receive_from_client => {
            if let Err(e) = result {
                error!("メッセージ処理中にエラーが発生: {}", e);
            } else {
                info!("クライアントが切断: {}", client_id_for_log);
            }
        }
    }

    // クライアントを削除
    remove_client(&clients, &client_id_for_log);
    Ok(())
}
