//! クライアント接続情報モジュール
//!
//! WebSocket接続クライアントの情報を管理します。

use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use uuid::Uuid;

/// ## クライアント接続情報
///
/// 各WebSocket接続のクライアント情報を保持します。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientInfo {
    /// クライアントの一意なID
    pub id: String,
    /// クライアントのIPアドレス
    pub ip: String,
    /// 接続した時刻（ISO8601形式）
    pub connected_at: String,
    /// 最後にアクティブだった時刻（ISO8601形式）
    pub last_active: String,
    /// 送信したメッセージの数
    pub messages_sent: usize,
}

impl ClientInfo {
    /// ## 新しいClientInfoを作成
    ///
    /// ### Arguments
    /// - `addr`: クライアントのソケットアドレス
    ///
    /// ### Returns
    /// - `Self`: 新しいClientInfoインスタンス
    pub fn new(addr: SocketAddr) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            ip: addr.ip().to_string(),
            connected_at: now.clone(),
            last_active: now,
            messages_sent: 0,
        }
    }

    /// ## 最終アクティブ時間を更新
    ///
    /// クライアントがアクティブな時に呼び出し、最終アクティブ時間を更新します。
    pub fn update_activity(&mut self) {
        self.last_active = chrono::Utc::now().to_rfc3339();
    }

    /// ## メッセージカウンターをインクリメント
    ///
    /// クライアントがメッセージを送信した時に呼び出し、カウンターを増加させます。
    pub fn increment_messages(&mut self) {
        self.messages_sent += 1;
    }
}
