use actix_web::dev::ServerHandle;
use std::sync::{Arc, Mutex};

/// ## アプリケーションの状態管理
///
/// Tauri アプリケーション全体で共有される状態を保持します。
/// 現在は WebSocket サーバーのハンドルを管理します。
pub struct AppState {
    /// WebSocket サーバーのハンドル (`ServerHandle`)
    ///
    /// サーバーが起動している場合は `Some(handle)`、停止している場合は `None`。
    /// `Arc<Mutex<...>>` でスレッドセーフな共有と変更を可能にします。
    pub server_handle: Arc<Mutex<Option<ServerHandle>>>,
}

impl AppState {
    /// ## 新しい AppState を作成する
    ///
    /// ### Returns
    /// - `Self`: 初期化された AppState インスタンス (サーバーハンドルは `None`)
    pub fn new() -> Self {
        Self {
            server_handle: Arc::new(Mutex::new(None)),
        }
    }
}
