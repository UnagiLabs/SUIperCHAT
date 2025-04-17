// types.rs
//! WebSocketシステム全体の型定義
//!
//! このモジュールでは以下の型を定義します：
//! 1. WebSocketクライアントとサーバー間で交換するメッセージの型と構造
//! 2. 接続管理やセッション処理に使用される共通の型と定数

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

//=============================================================================
// 接続管理関連の型と定数
//=============================================================================

/// WebSocketセッション設定値
pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
pub const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

/// ## グローバル接続カウンター
///
/// アプリケーション全体での接続数を追跡します。
/// アトミック操作で安全に更新されます。
pub static CONNECTIONS_COUNT: AtomicUsize = AtomicUsize::new(0);

/// ## 接続情報
///
/// 現在の接続数と最大接続数、接続クライアントの情報を保持します。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionsInfo {
    /// 現在の接続数
    pub active_connections: usize,
    /// 設定された最大接続数
    pub max_connections: usize,
    /// 接続中のクライアント情報のリスト
    pub clients: Vec<crate::ws_server::ClientInfo>,
}

/// 接続カウンターを増加させる
pub fn increment_connections() -> usize {
    let new_count = CONNECTIONS_COUNT.fetch_add(1, Ordering::SeqCst) + 1;
    println!("接続カウンター増加: {}", new_count);
    new_count
}

/// 接続カウンターを減少させる
pub fn decrement_connections() -> usize {
    let prev_count = CONNECTIONS_COUNT.fetch_sub(1, Ordering::SeqCst);
    let new_count = prev_count - 1;
    println!("接続カウンター減少: {} -> {}", prev_count, new_count);
    new_count
}

/// 現在の接続数を取得
pub fn get_connections_count() -> usize {
    CONNECTIONS_COUNT.load(Ordering::SeqCst)
}

//=============================================================================
// メッセージ関連の型定義
//=============================================================================

/// ## メッセージタイプの列挙型
///
/// WebSocketを通じて送受信するメッセージの種類を定義します。
#[derive(Debug, Deserialize, Serialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum MessageType {
    /// 通常のチャットメッセージ (スパチャなし)
    Chat,
    /// スーパーチャットメッセージ (SUI送金あり)
    Superchat,
    /// 接続確認用のPINGメッセージ
    Ping,
    /// サーバーからのPONGレスポンス
    Pong,
    /// エラーメッセージ
    Error,
    /// 接続状態の更新
    ConnectionStatus,
    /// 切断状態
    #[serde(rename = "DISCONNECTED")]
    Disconnected,
}

/// ## スーパーチャットのデータ構造体
///
/// スパチャメッセージに関連する情報を定義します。
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SuperchatData {
    /// 送金額 (SUI単位)
    pub amount: f64,
    /// トランザクションハッシュ
    pub tx_hash: String,
    /// 送金者のウォレットアドレス
    pub wallet_address: String,
}

/// ## ベースメッセージ構造体
///
/// すべてのメッセージに共通するフィールドを持つ構造体です。
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BaseMessage {
    /// メッセージタイプ
    #[serde(rename = "type")]
    pub message_type: MessageType,
    /// タイムスタンプ (オプション)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

/// ## チャットメッセージ構造体
///
/// 通常のチャットメッセージの構造体です。
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ChatMessage {
    /// メッセージタイプ (CHAT固定)
    #[serde(rename = "type")]
    pub message_type: MessageType,
    /// 表示名
    pub display_name: String,
    /// メッセージ内容
    #[serde(rename = "message")]
    pub content: String,
    /// タイムスタンプ (オプション)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

/// ## スーパーチャットメッセージ構造体
///
/// スパチャを含むメッセージの構造体です。
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SuperchatMessage {
    /// メッセージタイプ (SUPERCHAT固定)
    #[serde(rename = "type")]
    pub message_type: MessageType,
    /// 表示名
    pub display_name: String,
    /// メッセージ内容
    #[serde(rename = "message")]
    pub content: String,
    /// スーパーチャットデータ
    pub superchat: SuperchatData,
    /// タイムスタンプ (オプション)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

/// ## クライアントメッセージ列挙型
///
/// WebSocketクライアントから受信するメッセージの型を定義します。
/// メッセージの種類によって異なる構造体にデシリアライズします。
#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum ClientMessage {
    /// スーパーチャットメッセージ (superchatフィールドがある場合)
    Superchat(SuperchatMessage),
    /// 通常のチャットメッセージ
    Chat(ChatMessage),
}

/// ## サーバーレスポンスメッセージ
///
/// エラーやその他のシステムメッセージを送信するための構造体です。
#[derive(Debug, Serialize)]
pub struct ServerResponse {
    /// メッセージタイプ
    #[serde(rename = "type")]
    pub message_type: MessageType,
    /// メッセージ内容
    pub message: String,
    /// タイムスタンプ
    pub timestamp: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ## チャットメッセージのシリアライズとデシリアライズをテスト
    #[test]
    fn test_chat_message_serialization() {
        // テスト用のチャットメッセージを作成
        let chat_message = ChatMessage {
            message_type: MessageType::Chat,
            display_name: "テストユーザー".to_string(),
            content: "こんにちは、世界！".to_string(),
            timestamp: Some("2023-04-01T12:00:00Z".to_string()),
        };

        // メッセージをJSONにシリアライズ
        let json = serde_json::to_string(&chat_message).expect("シリアライズに失敗");
        println!("シリアライズされたチャットメッセージ: {}", json);

        // JSONからメッセージをデシリアライズ
        let parsed: ClientMessage = serde_json::from_str(&json).expect("デシリアライズに失敗");

        // 正しくパースされているか確認
        match parsed {
            ClientMessage::Chat(parsed_chat) => {
                assert_eq!(parsed_chat.message_type, MessageType::Chat);
                assert_eq!(parsed_chat.display_name, "テストユーザー");
                assert_eq!(parsed_chat.content, "こんにちは、世界！");
                assert_eq!(
                    parsed_chat.timestamp,
                    Some("2023-04-01T12:00:00Z".to_string())
                );
            }
            _ => panic!("チャットメッセージが正しくパースされませんでした"),
        }
    }

    /// ## スーパーチャットメッセージのシリアライズとデシリアライズをテスト
    #[test]
    fn test_superchat_message_serialization() {
        // テスト用のスーパーチャットデータを作成
        let superchat_data = SuperchatData {
            amount: 10.0,
            tx_hash: "0x1234567890abcdef".to_string(),
            wallet_address: "0xabcdef1234567890".to_string(),
        };

        // テスト用のスーパーチャットメッセージを作成
        let superchat_message = SuperchatMessage {
            message_type: MessageType::Superchat,
            display_name: "スパチャユーザー".to_string(),
            content: "大応援してます！".to_string(),
            superchat: superchat_data,
            timestamp: Some("2023-04-01T12:30:00Z".to_string()),
        };

        // メッセージをJSONにシリアライズ
        let json = serde_json::to_string(&superchat_message).expect("シリアライズに失敗");
        println!("シリアライズされたスーパーチャットメッセージ: {}", json);

        // JSONからメッセージをデシリアライズ
        let parsed: ClientMessage = serde_json::from_str(&json).expect("デシリアライズに失敗");

        // 正しくパースされているか確認
        match parsed {
            ClientMessage::Superchat(parsed_superchat) => {
                assert_eq!(parsed_superchat.message_type, MessageType::Superchat);
                assert_eq!(parsed_superchat.display_name, "スパチャユーザー");
                assert_eq!(parsed_superchat.content, "大応援してます！");
                assert_eq!(parsed_superchat.superchat.amount, 10.0);
                assert_eq!(parsed_superchat.superchat.tx_hash, "0x1234567890abcdef");
                assert_eq!(
                    parsed_superchat.superchat.wallet_address,
                    "0xabcdef1234567890"
                );
                assert_eq!(
                    parsed_superchat.timestamp,
                    Some("2023-04-01T12:30:00Z".to_string())
                );
            }
            _ => panic!("スーパーチャットメッセージが正しくパースされませんでした"),
        }
    }

    /// ## フロントエンドフォーマットとの互換性テスト
    #[test]
    fn test_frontend_compatibility() {
        // フロントエンドから送信される可能性のあるJSON形式
        let frontend_chat_json = r#"{
            "type": "chat",
            "display_name": "WebユーザーA",
            "message": "こんにちは、配信見てます！"
        }"#;

        let frontend_superchat_json = r#"{
            "type": "superchat",
            "display_name": "WebユーザーB",
            "message": "頑張ってください！",
            "superchat": {
                "amount": 5.0,
                "tx_hash": "0x9876543210fedcba",
                "wallet_address": "0xfedcba9876543210"
            }
        }"#;

        // 通常チャットメッセージのパース
        let parsed_chat: ClientMessage =
            serde_json::from_str(frontend_chat_json).expect("チャットメッセージのパースに失敗");

        match parsed_chat {
            ClientMessage::Chat(chat) => {
                assert_eq!(chat.message_type, MessageType::Chat);
                assert_eq!(chat.display_name, "WebユーザーA");
                assert_eq!(chat.content, "こんにちは、配信見てます！");
            }
            _ => panic!("チャットメッセージが正しくパースされませんでした"),
        }

        // スーパーチャットメッセージのパース
        let parsed_superchat: ClientMessage = serde_json::from_str(frontend_superchat_json)
            .expect("スーパーチャットメッセージのパースに失敗");

        match parsed_superchat {
            ClientMessage::Superchat(superchat) => {
                assert_eq!(superchat.message_type, MessageType::Superchat);
                assert_eq!(superchat.display_name, "WebユーザーB");
                assert_eq!(superchat.content, "頑張ってください！");
                assert_eq!(superchat.superchat.amount, 5.0);
                assert_eq!(superchat.superchat.tx_hash, "0x9876543210fedcba");
                assert_eq!(superchat.superchat.wallet_address, "0xfedcba9876543210");
            }
            _ => panic!("スーパーチャットメッセージが正しくパースされませんでした"),
        }
    }
}
