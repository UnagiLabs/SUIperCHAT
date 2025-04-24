use actix_web::dev::ServerHandle;
use sqlx::sqlite::SqlitePool;
use std::net::IpAddr;
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
    /// SQLiteデータベース接続プール
    ///
    /// データベースに接続済みの場合は `Some(pool)`、未接続の場合は `None`。
    pub db_pool: Arc<Mutex<Option<SqlitePool>>>,
    /// 現在アクティブな配信セッションのID
    ///
    /// 配信中（WebSocketサーバー起動中）は `Some(session_id)`、未配信時は `None`。
    pub current_session_id: Arc<Mutex<Option<String>>>,
    /// 外部IPアドレス
    ///
    /// 外部IP取得に成功した場合は `Some(ip)`、失敗または未取得の場合は `None`
    pub external_ip: Arc<Mutex<Option<IpAddr>>>,
    /// 外部IP取得が失敗したかどうかのフラグ
    ///
    /// 外部IP取得に失敗した場合は `true`、成功または未試行の場合は `false`
    pub global_ip_fetch_failed: Arc<Mutex<bool>>,
    /// CGNAT（Carrier-grade NAT）または二重NATが検出されたかどうかのフラグ
    ///
    /// CGNATが検出された場合は `true`、検出されなかった場合は `false`
    /// このフラグが `true` の場合、WebSocketサーバーへの外部からの接続が制限される可能性があります
    pub cgnat_detected: Arc<Mutex<bool>>,
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
            db_pool: Arc::new(Mutex::new(None)),
            current_session_id: Arc::new(Mutex::new(None)),
            external_ip: Arc::new(Mutex::new(None)),
            global_ip_fetch_failed: Arc::new(Mutex::new(false)),
            cgnat_detected: Arc::new(Mutex::new(false)),
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
