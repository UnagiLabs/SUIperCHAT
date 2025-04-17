//! SUIperCHAT Streamer Appのコアライブラリ
//!
//! このライブラリはStreamerアプリケーションの主要な機能を提供します。
//! WebSocketサーバー、コマンド処理、状態管理などの機能が含まれています。

// --- モジュール宣言 ---
pub mod commands; // コマンドモジュール
pub mod state; // 状態管理モジュール
pub mod types; // 型定義モジュール
pub mod ws_server; // WebSocket サーバーロジック

// モジュールの再エクスポート
pub use commands::*;
pub use state::AppState;

// Tauri コマンド関数の再エクスポート
pub use commands::get_streamer_info;
pub use commands::set_wallet_address;
pub use commands::start_websocket_server;
pub use commands::stop_websocket_server;
// 接続管理コマンドの再エクスポート
pub use commands::disconnect_client;
pub use commands::get_connections_info;
pub use commands::set_connection_limits;

/// ## Tauriアプリケーションのエントリーポイント
///
/// Tauriアプリケーションの実行に必要な設定と初期化を行います。
/// このメソッドはmain.rsから呼び出されます。
///
/// ### Returns
/// - なし。エラーが発生した場合は、プログラムは終了します。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // --- AppState を Tauri で管理 ---
        .manage(AppState::new())
        // --- Tauri コマンドハンドラーを登録 ---
        .invoke_handler(tauri::generate_handler![
            commands::start_websocket_server,
            commands::stop_websocket_server,
            commands::set_wallet_address,
            commands::get_streamer_info,
            // 接続管理コマンドを登録
            commands::get_connections_info,
            commands::disconnect_client,
            commands::set_connection_limits
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
