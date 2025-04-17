//! WebSocketサーバーの共通型定義
//!
//! 接続管理やセッション処理に使用される共通の型と定数を定義します。

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

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
