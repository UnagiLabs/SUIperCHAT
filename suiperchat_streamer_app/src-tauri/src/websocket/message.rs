/**
 * WebSocketメッセージ型定義
 *
 * WebSocketを通じて送受信されるメッセージの型を定義します。
 * 視聴者が送信するスーパーチャットメッセージや通常メッセージの形式を規定します。
 *
 * @module websocket/message
 */
use serde::{Deserialize, Serialize};

/// WebSocketで送受信されるメッセージの型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSocketMessage {
    /// @property message_type {String} - メッセージの種類（"chat", "superchat", "system"など）
    pub message_type: String,
    /// @property display_name {String} - 送信者の表示名
    pub display_name: String,
    /// @property content {String} - メッセージ本文
    pub content: String,
    /// @property wallet_address {Option<String>} - 送信者のウォレットアドレス（任意）
    pub wallet_address: Option<String>,
    /// @property amount {Option<f64>} - スーパーチャットの金額（SUI単位、通常チャットはNone）
    pub amount: Option<f64>,
    /// @property tx_hash {Option<String>} - トランザクションハッシュ（スーパーチャットの場合のみ）
    pub tx_hash: Option<String>,
    /// @property timestamp {i64} - タイムスタンプ（ミリ秒単位のUNIXタイムスタンプ）
    pub timestamp: i64,
}

impl WebSocketMessage {
    /// 通常チャットメッセージを作成する
    pub fn new_chat(display_name: String, content: String, wallet_address: Option<String>) -> Self {
        Self {
            message_type: "chat".to_string(),
            display_name,
            content,
            wallet_address,
            amount: None,
            tx_hash: None,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }

    /// スーパーチャットメッセージを作成する
    pub fn new_superchat(
        display_name: String,
        content: String,
        wallet_address: String,
        amount: f64,
        tx_hash: String,
    ) -> Self {
        Self {
            message_type: "superchat".to_string(),
            display_name,
            content,
            wallet_address: Some(wallet_address),
            amount: Some(amount),
            tx_hash: Some(tx_hash),
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }

    /// システムメッセージを作成する
    pub fn new_system(content: String) -> Self {
        Self {
            message_type: "system".to_string(),
            display_name: "System".to_string(),
            content,
            wallet_address: None,
            amount: None,
            tx_hash: None,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }
}

/// サーバー -> クライアントへの接続確立応答
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionResponse {
    /// @property success {bool} - 接続が成功したかどうか
    pub success: bool,
    /// @property client_id {String} - 割り当てられたクライアントID
    pub client_id: String,
    /// @property message {String} - 接続結果メッセージ
    pub message: String,
}
