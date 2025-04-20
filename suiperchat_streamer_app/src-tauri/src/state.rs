use actix_web::dev::ServerHandle;
use std::sync::{Arc, Mutex};
use tokio::runtime::Handle as TokioHandle;

/// ## アプリケーションの状態管理
///
/// Tauri アプリケーション全体で共有される状態を保持します。
/// WebSocket サーバーハンドルと Tokio ランタイムハンドルを管理します。
pub struct AppState {
    /// WebSocket サーバーのハンドル (`ServerHandle`)
    ///
    /// サーバーが起動している場合は `Some(handle)`、停止している場合は `None`。
    /// `Arc<Mutex<...>>` でスレッドセーフな共有と変更を可能にします。
    /// WebSocket サーバーと OBS サーバーのハンドル (`(ws_handle, obs_handle)`)
    ///
    /// サーバーが起動している場合は `Some((ws, obs))`、停止している場合は `None`。
    pub server_handle: Arc<Mutex<Option<(ServerHandle, ServerHandle)>>>,
    /// Tokio ランタイムハンドル (`tokio::runtime::Handle`)
    ///
    /// WebSocket サーバースレッドで使用される Tokio ランタイムへのハンドル。
    /// サーバー停止時にこのハンドルを使って非同期タスクを spawn する。
    pub runtime_handle: Arc<Mutex<Option<TokioHandle>>>,
    pub wallet_address: Arc<Mutex<Option<String>>>,
    /// WebSocketサーバーがリッスンしているホスト名
    pub host: Arc<Mutex<Option<String>>>,
    /// WebSocketサーバーがリッスンしているポート番号
    pub port: Arc<Mutex<Option<u16>>>,
    /// OBSサーバーがリッスンしているポート番号
    pub obs_port: Arc<Mutex<Option<u16>>>,
}

impl AppState {
    /// ## 新しい AppState を作成する
    ///
    /// ### Returns
    /// - `Self`: 初期化された AppState インスタンス
    pub fn new() -> Self {
        Self {
            server_handle: Arc::new(Mutex::new(None)),
            runtime_handle: Arc::new(Mutex::new(None)),
            wallet_address: Arc::new(Mutex::new(None)),
            host: Arc::new(Mutex::new(None)),
            port: Arc::new(Mutex::new(None)),
            obs_port: Arc::new(Mutex::new(None)),
        }
    }
}

/// ## AppStateのデフォルト実装
///
/// `new()`メソッドを使用して、デフォルトのAppStateインスタンスを生成します。
impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
