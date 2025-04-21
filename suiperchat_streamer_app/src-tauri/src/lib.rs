//! SUIperCHAT Streamer Appのコアライブラリ
//!
//! このライブラリはStreamerアプリケーションの主要な機能を提供します。
//! WebSocketサーバー、コマンド処理、状態管理などの機能が含まれています。

// --- モジュール宣言 ---
pub mod commands; // コマンドモジュール
pub mod database; // データベース操作モジュール
pub mod db_models; // データベースモデル定義モジュール
pub mod state; // 状態管理モジュール
pub mod types; // 型定義モジュール
pub mod ws_server; // WebSocket サーバーロジック

// モジュールの再エクスポート
pub use state::AppState;

// Tauri コマンド関数の再エクスポート
pub use commands::server::{start_websocket_server, stop_websocket_server};
pub use commands::wallet::{get_streamer_info, set_wallet_address};
// 接続管理コマンドの再エクスポート
pub use commands::connection::{disconnect_client, get_connections_info, set_connection_limits};
// 履歴取得コマンドの再エクスポート
pub use commands::history::{get_active_session, get_message_history, get_sessions};

use log::{error, info};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

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
            // サーバー関連コマンド
            commands::server::start_websocket_server,
            commands::server::stop_websocket_server,
            // ウォレット関連コマンド
            commands::wallet::set_wallet_address,
            commands::wallet::get_streamer_info,
            // 接続管理コマンド
            commands::connection::get_connections_info,
            commands::connection::disconnect_client,
            commands::connection::set_connection_limits,
            // 履歴取得コマンド
            commands::history::get_message_history,
            commands::history::get_sessions,
            commands::history::get_active_session
        ])
        // --- Tauriのセットアップ処理でデータベース接続初期化 ---
        .setup(|app| {
            // データベースパスの決定
            let db_path = if cfg!(debug_assertions) {
                // 開発ビルド時: プロジェクト内の相対パス
                PathBuf::from("../prisma/dev.db")
            } else {
                // リリースビルド時: アプリケーションデータディレクトリ
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .expect("アプリケーションデータディレクトリの取得に失敗しました");

                let db_dir = app_data_dir.join("data");
                std::fs::create_dir_all(&db_dir).expect("データディレクトリの作成に失敗しました");

                db_dir.join("suiperchat_data.db")
            };

            // データベース接続の初期化
            init_database(app.handle().clone(), db_path);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// ## データベース接続の初期化
///
/// アプリケーション起動時にデータベース接続プールを初期化します。
/// 接続に成功した場合、AppStateにプールを設定します。
///
/// ### 引数
/// - `app_handle`: Tauriアプリケーションハンドル
/// - `db_path`: データベースファイルのパス
fn init_database(app_handle: AppHandle, db_path: PathBuf) {
    info!("データベース接続を初期化: {:?}", db_path);

    // Tauriの標準的なパターンでバックグラウンドタスクを実行
    let app_handle_clone = app_handle.clone();
    std::thread::spawn(move || {
        // 新しいTokioランタイムを作成し、その中で非同期処理を実行
        let rt = tokio::runtime::Runtime::new().expect("Tokioランタイムの作成に失敗しました");

        rt.block_on(async {
            // データベース接続プールを作成
            match database::create_db_pool(&db_path, 5).await {
                Ok(pool) => {
                    info!("データベース接続に成功しました");

                    // AppStateにプールを設定
                    let db_pool = pool.clone();
                    if let Ok(mut db_pool_lock) =
                        app_handle_clone.state::<AppState>().db_pool.lock()
                    {
                        *db_pool_lock = Some(db_pool);
                        info!("AppStateにデータベースプールを設定しました");
                    } else {
                        error!("AppStateロックの取得に失敗しました");
                    }
                }
                Err(e) => {
                    error!("データベース接続に失敗しました: {:?}", e);
                }
            }
        });
    });
}
