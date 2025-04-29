//! WebSocketサーバーモジュール
//!
//! SUIperCHATアプリケーションのWebSocketサーバー機能を提供します。
//! クライアント接続管理、セッション処理、メッセージハンドリングなどの機能を含みます。

// サブモジュールの宣言
pub mod client_info;
pub mod connection_manager;
pub mod ip_utils;
pub mod routes;
pub mod server_manager;
pub mod server_utils;
pub mod session;
pub mod tunnel;

// 型の再エクスポート
pub use client_info::ClientInfo;
pub use connection_manager::global::{
    disconnect_client, get_connections_info, get_manager, set_app_handle, set_max_connections,
};
pub use routes::{obs_index_page, obs_script, obs_styles, status_page, websocket_route};
pub use server_manager::{start_server, stop_server};
pub use server_utils::{format_socket_addr, resolve_static_file_path};
pub use session::create_ws_session;
// ConnectionsInfoはtypes.rsから再エクスポート
pub use crate::types::ConnectionsInfo;
