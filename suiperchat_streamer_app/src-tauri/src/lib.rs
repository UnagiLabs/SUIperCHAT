//! SUIperCHAT Streamer Appのコアライブラリ
//!
//! このライブラリはStreamerアプリケーションの主要な機能を提供します。
//! WebSocketサーバー、コマンド処理、状態管理などの機能が含まれています。

use sqlx::sqlite::SqliteConnectOptions;
use std::str::FromStr;
use tauri::Manager;

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
// 履歴関連コマンドの再エクスポート
pub use commands::history::get_message_history;

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
        // --- セットアップフックを登録 ---
        .setup(|app| {
            // アプリケーションハンドルのクローンを取得
            let app_handle = app.handle().clone();

            // 非同期処理をspawn
            tauri::async_runtime::spawn(async move {
                // 開発/リリースビルドに応じたDBパス解決と接続オプション生成
                let connect_options_result = async {
                    let db_path = if cfg!(debug_assertions) {
                        // 開発ビルド時
                        std::path::PathBuf::from("../prisma/dev.db") // src ディレクトリからの相対パス
                    } else {
                        // リリースビルド時
                        let app_data_dir = match app_handle.path().app_data_dir() {
                            Ok(dir) => dir,
                            Err(_) => {
                                return Err(
                                    "アプリデータディレクトリの取得に失敗しました。".to_string()
                                );
                            }
                        };
                        let db_dir = app_data_dir.join("data");
                        if let Err(e) = std::fs::create_dir_all(&db_dir) {
                            return Err(format!(
                                "データディレクトリ作成エラー ({}): {}",
                                db_dir.display(),
                                e
                            ));
                        }
                        db_dir.join("suiperchat_data.db")
                    };

                    let db_url = format!("sqlite:{}", db_path.to_string_lossy());
                    println!("データベースURL: {}", db_url);

                    // SQLiteConnectOptionsを設定（データベースが存在しない場合は作成する）
                    match SqliteConnectOptions::from_str(&db_url) {
                        Ok(options) => Ok(options
                            .create_if_missing(true)
                            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
                            .foreign_keys(true)),
                        Err(e) => Err(format!("データベースURLのパースに失敗しました: {}", e)),
                    }
                }
                .await; // db_pathとconnect_options生成処理を完了

                // 接続オプションの取得に成功した場合のみプール初期化に進む
                match connect_options_result {
                    Ok(connect_options) => {
                        // SQLiteプールの初期化（接続オプションを使用）
                        match sqlx::sqlite::SqlitePoolOptions::new()
                            .max_connections(5)
                            .connect_with(connect_options)
                            .await
                        {
                            Ok(pool) => {
                                let app_state = app_handle.state::<AppState>();
                                let mut pool_guard = app_state.db_pool.lock().unwrap(); // Mutexロック
                                *pool_guard = Some(pool);
                                println!("データベースプールの初期化に成功しました");
                            }
                            Err(e) => {
                                eprintln!("データベース接続エラー: {}", e);
                                // connect_with エラー時の追加処理が必要な場合はここに記述
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("DB接続オプション生成エラー: {}", e);
                        eprintln!("データベース初期化をスキップします。");
                    }
                }
            });

            Ok(())
        })
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
            // 履歴関連コマンド
            commands::history::get_message_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
