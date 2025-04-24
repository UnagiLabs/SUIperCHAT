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

/// ## テーブル作成のためのSQL文
///
/// データベース初期化時に実行されるテーブル作成のためのSQL文を定義します。
/// アプリケーションの初回起動時に必要なテーブルを自動的に作成します。
const CREATE_SESSIONS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    created_at TEXT NOT NULL, -- DEFAULT削除 (Rust側で設定するため)
    updated_at TEXT NOT NULL  -- DEFAULT削除 (Rust側で設定するため)
);
"#;

const CREATE_MESSAGES_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    timestamp TEXT NOT NULL,
    display_name TEXT NOT NULL,
    message TEXT NOT NULL,
    amount REAL DEFAULT 0,
    tx_hash TEXT,
    wallet_address TEXT,
    session_id TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
"#;

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
                        // 開発ビルド時: プロジェクトルート（suiperchat_streamer_app）直下に dev.db を作成
                        let path = std::path::PathBuf::from("../dev.db"); // パスを ../dev.db に変更（プロジェクトルートを指す）
                        println!("開発モードのデータベースパス: {}", path.display());

                        // 開発用DBが存在するか確認
                        if !path.exists() {
                            println!("警告: 開発用データベースファイル({})が存在しません。自動的に作成されます。", path.display());
                        }

                        path
                    } else {
                        // リリースビルド時
                        let app_data_dir = match app_handle.path().app_data_dir() {
                            Ok(dir) => dir,
                            Err(e) => {
                                return Err(format!(
                                    "アプリデータディレクトリの取得に失敗しました: {}",
                                    e
                                ));
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
                        let path = db_dir.join("suiperchat_data.db");
                        println!("本番モードのデータベースパス: {}", path.display());
                        path
                    };

                    let db_url = format!("sqlite:{}", db_path.to_string_lossy());
                    println!("データベースURL: {}", db_url);

                    // SQLiteConnectOptionsを設定
                    match SqliteConnectOptions::from_str(&db_url) {
                        Ok(options) => {
                            println!("SQLite接続オプションを設定しました");
                            Ok(options
                                .create_if_missing(true)
                                .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
                                .foreign_keys(true))
                        }
                        Err(e) => {
                            let error_msg = format!("データベースURLのパースに失敗しました: {}", e);
                            eprintln!("エラー: {}", error_msg);
                            Err(error_msg)
                        }
                    }
                }
                .await; // db_pathとconnect_options生成処理を完了

                // 接続オプションの取得に成功した場合のみプール初期化に進む
                match connect_options_result {
                    Ok(connect_options) => {
                        // SQLiteプールの初期化（接続オプションを使用）
                        println!("データベース接続プールを初期化しています...");
                        match sqlx::sqlite::SqlitePoolOptions::new()
                            .max_connections(5)
                            .connect_with(connect_options)
                            .await
                        {
                            Ok(pool) => {
                                println!("データベース接続プールの初期化に成功しました");

                                // データベースプールの設定
                                // MutexGuardのスコープを制限するためブロックで囲む
                                {
                                    if let Ok(mut db_pool_guard) = app_handle.state::<AppState>().db_pool.lock() {
                                        *db_pool_guard = Some(pool.clone());
                                        println!("AppStateにデータベースプールを設定しました");
                                    } else {
                                        eprintln!("エラー: データベースプールのロックに失敗しました");
                                    }
                                } // ここでdb_pool_guardは解放される

                                // テーブル作成処理の実行
                                println!("必要なテーブルの作成を開始します...");

                                // sessionsテーブルの作成
                                match sqlx::query(CREATE_SESSIONS_TABLE_SQL)
                                    .execute(&pool)
                                    .await
                                {
                                    Ok(_) => println!("sessionsテーブルの作成に成功しました"),
                                    Err(e) => {
                                        eprintln!("sessionsテーブル作成中にエラーが発生しました: {}", e);
                                        eprintln!("警告: sessionsテーブルが作成できなかったため、一部の機能が動作しない可能性があります");
                                    }
                                }

                                // messagesテーブルの作成
                                match sqlx::query(CREATE_MESSAGES_TABLE_SQL)
                                    .execute(&pool)
                                    .await
                                {
                                    Ok(_) => println!("messagesテーブルの作成に成功しました"),
                                    Err(e) => {
                                        eprintln!("messagesテーブル作成中にエラーが発生しました: {}", e);
                                        eprintln!("警告: messagesテーブルが作成できなかったため、履歴機能が動作しない可能性があります");
                                    }
                                }

                                println!("テーブル作成処理が完了しました");
                            }
                            Err(e) => {
                                eprintln!("データベース接続エラー: {}", e);
                                // 接続エラーの詳細情報を取得してログに出力
                                let err_details = match e {
                                    sqlx::Error::Database(db_err) => {
                                        format!("データベースエラー: {}", db_err)
                                    }
                                    sqlx::Error::PoolTimedOut => "接続プールのタイムアウト".to_string(),
                                    sqlx::Error::PoolClosed => "接続プールが閉じられています".to_string(),
                                    sqlx::Error::WorkerCrashed => "ワーカーがクラッシュしました".to_string(),
                                    _ => format!("その他のエラー: {}", e),
                                };
                                eprintln!("詳細: {}", err_details);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("DB接続オプション生成エラー: {}", e);
                        eprintln!("データベース初期化をスキップします。この状態ではメッセージの保存と履歴機能は動作しません。");
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
