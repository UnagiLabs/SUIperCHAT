/**
 * WebSocketクライアント管理モジュール
 *
 * 接続されたクライアントの情報を管理します。
 * クライアントの識別、保持、削除などの機能を提供します。
 *
 * @module websocket/client
 */
use futures_channel::mpsc::{unbounded, UnboundedSender};
use futures_util::{stream::SplitSink, StreamExt};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::net::TcpStream;
use tokio_tungstenite::{tungstenite::Message, WebSocketStream};
use uuid::Uuid;

/// WebSocketクライアント接続情報
pub struct WebSocketClient {
    /// クライアントの一意識別子
    pub id: String,
    /// メッセージ送信用チャネル
    pub sender: UnboundedSender<Message>,
    /// ウォレットアドレス（認証済みの場合）
    pub wallet_address: Option<String>,
    /// 接続時刻（UNIXタイムスタンプ）
    pub connected_at: i64,
}

/// WebSocketクライアント管理のコレクション
pub type ClientsMap = Arc<Mutex<HashMap<String, WebSocketClient>>>;

/// 新しいクライアントマップを作成
pub fn new_clients_map() -> ClientsMap {
    Arc::new(Mutex::new(HashMap::new()))
}

/// 新しいクライアントIDを生成
pub fn generate_client_id() -> String {
    Uuid::new_v4().to_string()
}

/// クライアントを追加
pub fn add_client(
    clients: &ClientsMap,
    id: String,
    sender: UnboundedSender<Message>,
    wallet_address: Option<String>,
) {
    let client = WebSocketClient {
        id: id.clone(),
        sender,
        wallet_address,
        connected_at: chrono::Utc::now().timestamp(),
    };

    // クライアントをコレクションに追加
    if let Ok(mut clients_map) = clients.lock() {
        clients_map.insert(id.clone(), client);
        log::info!("クライアント追加: {} (合計: {})", id, clients_map.len());
    } else {
        log::error!("クライアント追加失敗: ロックの取得に失敗");
    }
}

/// クライアントを削除
pub fn remove_client(clients: &ClientsMap, id: &str) {
    if let Ok(mut clients_map) = clients.lock() {
        clients_map.remove(id);
        log::info!("クライアント削除: {} (残り: {})", id, clients_map.len());
    } else {
        log::error!("クライアント削除失敗: ロックの取得に失敗");
    }
}

/// メッセージを全クライアントにブロードキャスト
pub fn broadcast_message(clients: &ClientsMap, message: Message) {
    if let Ok(clients_map) = clients.lock() {
        for (_, client) in clients_map.iter() {
            if let Err(e) = client.sender.unbounded_send(message.clone()) {
                log::error!("メッセージ送信エラー {}: {}", client.id, e);
            }
        }
    } else {
        log::error!("ブロードキャスト失敗: ロックの取得に失敗");
    }
}

/// WebSocketストリームから送受信用の分割されたチャネルを作成
pub fn create_channel(
    ws_stream: WebSocketStream<TcpStream>,
) -> (
    SplitSink<WebSocketStream<TcpStream>, Message>,
    UnboundedSender<Message>,
) {
    let (ws_sender, _) = ws_stream.split();
    let (sender, _) = unbounded();
    (ws_sender, sender)
}
