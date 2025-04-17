//! WebSocketサーバーモジュール
//!
//! SUIperCHATアプリケーションのWebSocketサーバー機能を提供します。
//! クライアント接続管理、セッション処理、メッセージハンドリングなどの機能を含みます。

// サブモジュールの宣言
pub mod client_info;
pub mod connection_manager;
pub mod session;
pub mod types;

// 型の再エクスポート
pub use client_info::ClientInfo;
pub use types::ConnectionsInfo;

// 機能の再エクスポート
pub use connection_manager::global::{
    disconnect_client, get_connections_info, get_manager, set_app_handle, set_max_connections,
};
pub use session::create_ws_session;
