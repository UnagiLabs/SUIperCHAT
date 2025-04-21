# Rustバックエンド SQLiteデータベース連携 実装計画

## 1. 目的

- WebSocket経由で受信するチャットメッセージとスーパーチャット情報をSQLiteデータベースに永続化する。
- 将来的に管理画面 (todo 3.8) から履歴の検索・フィルタリングを可能にするためのバックエンド基盤を構築する。
- 既存の Prisma スキーマ定義 (`prisma/schema.prisma`) を活用する。

## 2. 技術選定

- **データベース:** SQLite (既存の `suiperchat_streamer_app/prisma/dev.db` を当面利用)
- **Rust ORM/クエリビルダ:** `sqlx` (非同期対応、コンパイル時検証)
- **セッションID生成:** `uuid` クレート
- **非同期ランタイム:** Tokio (既存環境との整合性)
- **マイグレーション:** Prisma Migrate (`prisma migrate dev`) を継続利用

## 3. 実装ステップ (詳細版)

以下のステップに分割して実装を進め、各ステップ完了後にコミットします。

### ステップ 1: セットアップ - 依存関係の追加と基本ファイル作成

-   **タスク:**
    -   `suiperchat_streamer_app/src-tauri/` ディレクトリで `cargo add sqlx --features runtime-tokio-native-tls,sqlite,chrono` を実行。
    -   `suiperchat_streamer_app/src-tauri/` ディレクトリで `cargo add uuid --features v4,serde` を実行。
    -   (必要であれば `cargo add chrono --features serde` も実行)
    -   `cargo build` を実行して依存関係が解決されるか確認。
    -   空の `src-tauri/src/database.rs` ファイルを作成。
    -   空の `src-tauri/src/db_models.rs` ファイルを作成。
    -   空の `src-tauri/src/commands/history.rs` ファイルを作成。
    -   `src-tauri/src/commands/mod.rs` に `pub mod history;` を追加。
-   **コミットタイトル案:** `[feat] SQLite連携の基本ファイルと依存関係をセットアップ`

### ステップ 2: データモデルの定義

-   **タスク:**
    -   `src-tauri/src/db_models.rs` に `Message` 構造体と `Session` 構造体を定義（既存計画参照）。
        ```rust
        // src/db_models.rs
        use chrono::{DateTime, Utc};
        use sqlx::FromRow;

        #[derive(FromRow, Debug, Clone, serde::Serialize, serde::Deserialize)]
        pub struct Message {
            pub id: String,
            pub timestamp: DateTime<Utc>,
            pub display_name: String,
            #[sqlx(rename = "message")]
            pub content: String,
            // Prisma Float は f64 にマッピング
            pub amount: Option<f64>, // スパチャでない場合は NULL
            pub tx_hash: Option<String>,
            pub wallet_address: Option<String>,
            pub session_id: Option<String>, // どの配信セッションのメッセージかを示すID
        }

        #[derive(FromRow, Debug, Clone, serde::Serialize, serde::Deserialize)]
        pub struct Session {
            pub id: String,         // UUID
            pub started_at: DateTime<Utc>,
            pub ended_at: Option<DateTime<Utc>>,
        }
        ```
    -   `sqlx::FromRow`, `serde::Serialize`, `serde::Deserialize` などを derive する。
    -   `cargo build` を実行してコンパイルエラーがないか確認。
-   **コミット目安:** このステップが完了したらコミット。
-   **コミットタイトル案:** `[feat] SQLite用MessageおよびSessionデータモデルを定義`

### ステップ 3: データベース接続管理 (`AppState`)

-   **タスク:**
    -   `src-tauri/src/state.rs` の `AppState` に `db_pool: Arc<Mutex<Option<SqlitePool>>>` と `current_session_id: Arc<Mutex<Option<String>>>` を追加。
    -   `AppState::new()` で上記フィールドを `Arc::new(Mutex::new(None))` で初期化。
    -   `cargo build` を実行してコンパイルエラーがないか確認。
-   **コミット目安:** このステップが完了したらコミット。
-   **コミットタイトル案:** `[feat] AppStateにdb_poolとcurrent_session_idを追加`

### ステップ 4: データベース接続管理 (初期化とパス解決)

-   **タスク:**
    -   `src-tauri/src/main.rs` の `setup` フック内で非同期処理を実行。
    -   開発/リリースビルドに応じたDBパス解決ロジックを実装。
        ```rust
        // setup フック内 (app_handle が利用可能)
        let app_handle = app.handle().clone(); // app_handle を取得
        tauri::async_runtime::spawn(async move { // 非同期処理をspawn
            let db_path = if cfg!(debug_assertions) {
                // 開発ビルド時
                std::path::PathBuf::from("../prisma/dev.db") // src ディレクトリからの相対パス
            } else {
                // リリースビルド時
                let app_data_dir = tauri::api::path::app_data_dir(&app_handle.config())
                    .expect("Failed to get app data directory"); // エラー処理改善推奨
                let db_dir = app_data_dir.join("data");
                std::fs::create_dir_all(&db_dir)
                    .expect("Failed to create data directory"); // エラー処理改善推奨
                db_dir.join("suiperchat_data.db")
            };
            let db_url = format!("sqlite:{}", db_path.to_string_lossy());
            println!("Using database URL: {}", db_url);

            match sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(5)
                .connect(&db_url)
                .await
            {
                Ok(pool) => {
                    let app_state = app_handle.state::<AppState>();
                    let mut pool_guard = app_state.db_pool.lock().unwrap(); // Mutexロック
                    *pool_guard = Some(pool);
                     println!("Database pool initialized successfully.");
                }
                Err(e) => {
                    eprintln!("Failed to initialize database pool: {}", e);
                    // ここで適切なエラー処理を行う (例: アプリケーション終了、エラー表示)
                }
            }
        });
        ```
    -   `cargo build` を実行してコンパイルエラーがないか確認。
-   **コミット目安:** このステップが完了したらコミット。
-   **コミットタイトル案:** `[feat] DB接続プールの初期化とパス解決を実装`

### ステップ 5: セッション管理 (DB操作とAppState更新)

-   **タスク:**
    -   `src-tauri/src/database.rs` に `async fn create_session(pool: &SqlitePool, session_id: &str) -> Result<(), sqlx::Error>` を実装 (`INSERT INTO Session`)。
    -   `src-tauri/src/database.rs` に `async fn end_session(pool: &SqlitePool, session_id: &str) -> Result<(), sqlx::Error>` を実装 (`UPDATE Session SET ended_at`)。
    -   `src-tauri/src/ws_server/server_manager.rs` の `run_servers` 内、サーバー起動成功時に `uuid::Uuid::new_v4().to_string()` でID生成、`database::create_session` を呼び出し、`AppState` の `current_session_id` を設定。
    -   `src-tauri/src/ws_server/server_manager.rs` の `stop_server` 内で `AppState` から `current_session_id` を取得、`database::end_session` を呼び出し、`AppState` の `current_session_id` をクリア。
    -   `cargo build` を実行してコンパイルエラーがないか確認。
-   **コミット目安:** このステップが完了したらコミット。
-   **コミットタイトル案:** `[feat] DBセッションの作成・終了ロジックを実装`

### ステップ 6: メッセージ保存 (DB操作)

-   **タスク:**
    -   `src-tauri/src/database.rs` に `async fn save_message_db(pool: &SqlitePool, message: &db_models::Message) -> Result<(), sqlx::Error>` を実装 (`INSERT INTO Message`)。
    -   `cargo build` を実行してコンパイルエラーがないか確認。
-   **コミット目安:** このステップが完了したらコミット。
-   **コミットタイトル案:** `[feat] メッセージをDBに保存する関数を実装`

### ステップ 7: メッセージ保存 (WebSocketセッション連携)

-   **タスク:**
    -   `src-tauri/src/ws_server/session.rs` の `WsSession` に `db_pool: Arc<Mutex<Option<SqlitePool>>>` と `current_session_id: Option<String>` フィールドを追加。
    -   `WsSession::new` または `with_connection_manager` などで `AppState` から `db_pool` への参照を取得するように修正 (例: `create_ws_session` で `AppState` を取得して渡す)。
    -   `WsSession::started` で `AppState` から `current_session_id` を取得して `self.current_session_id` に設定。
    -   `StreamHandler::handle` で受信メッセージから `db_models::Message` オブジェクトを作成 (`self.current_session_id` を設定)。
    -   `tokio::spawn` を使用して `database::save_message_db` を非同期に呼び出す (取得した `db_pool` の参照と `Message` を渡す)。
    -   `cargo build` を実行してコンパイルエラーがないか確認。
-   **コミット目安:** このステップが完了したらコミット。
-   **コミットタイトル案:** `[feat] WebSocketセッションにメッセージ保存処理を統合`

### ステップ 8: 履歴取得 (DB操作)

-   **タスク:**
    -   `src-tauri/src/database.rs` に `async fn fetch_messages(pool: &SqlitePool, limit: i64, offset: i64 /*, filters... */) -> Result<Vec<db_models::Message>, sqlx::Error>` を実装 (`SELECT FROM Message`、ページネーション含む)。
    -   `cargo build` を実行してコンパイルエラーがないか確認。
-   **コミット目安:** このステップが完了したらコミット。
-   **コミットタイトル案:** `[feat] DBからメッセージ履歴を取得する関数を実装`

### ステップ 9: 履歴取得 (Tauriコマンド)

-   **タスク:**
    -   `src-tauri/src/commands/history.rs` に `async fn get_message_history(limit: i64, offset: i64, /* filters... */ app_state: State<'_, AppState>) -> Result<Vec<db_models::Message>, String>` Tauri コマンドを実装。
    -   `commands/mod.rs` の `use` 文を更新 (`pub use history::get_message_history;`)。
    -   `cargo build` を実行してコンパイルエラーがないか確認。
-   **コミット目安:** このステップが完了したらコミット。
-   **コミットタイトル案:** `[feat] メッセージ履歴取得用のTauriコマンドを追加`

### ステップ 10: エラーハンドリングとリファクタリング

-   **タスク:**
    -   全体を通してエラーハンドリングを見直し、改善 (`Result` の伝播、ログ出力、ユーザーへのエラー通知など)。
    -   コードのリファクタリング、ドキュメントコメントの追加。
    -   `unwrap()` や `expect()` を可能な限り減らし、より安全なエラー処理を目指す。
-   **コミット目安:** 適切な区切りでコミット。
-   **コミットタイトル案:** `[refactor] DB連携のエラー処理改善とコード整理` または `[docs] DB関連コードにドキュメントコメントを追加`

## 4. ファイル構成案

```
suiperchat_streamer_app/src-tauri/
├── Cargo.toml                 # 依存関係追加
├── src/
│   ├── main.rs                # DBプール初期化
│   ├── state.rs               # AppState に db_pool 追加
│   ├── database.rs            # DB操作関数 (新規)
│   ├── db_models.rs           # DBモデル構造体 (新規)
│   ├── commands/
│   │   ├── mod.rs             # history モジュール追加
│   │   ├── history.rs         # 履歴取得コマンド (新規)
│   │   └── ... (既存ファイル)
│   └── ws_server/
│       ├── session.rs         # DB保存処理呼び出し追加
│       └── ... (既存ファイル)
└── prisma/
    ├── schema.prisma
    └── dev.db
```

## 5. 注意点・今後の課題

- **アクティブなセッションIDの管理:** 上記ステップで方針を具体化しました。`AppState` で `current_session_id` を管理し、サーバー起動/停止時に `Session` テーブルにも記録します。`WsSession` は `AppState` から `session_id` を取得して利用します。
- **DBファイルパス:** 上記ステップで、開発/リリースビルドに応じたパス解決方法を計画に含めました (`cfg!(debug_assertions)` と `tauri::api::path::app_data_dir` を利用)。
- **非同期処理:** WebSocketセッション内でのDB操作呼び出しは `tokio::spawn` を使用してノンブロッキングにします。
- **エラーハンドリング:** より詳細なエラーハンドリングとユーザー通知。
- **トランザクション:** 複数のDB操作を伴う場合にトランザクションを検討する (`pool.begin().await?`)。
- **検索・フィルタリング:** `fetch_messages` 関数のフィルタリング機能を具体的に実装する。
- **テスト:** DB操作に関するテストコードを作成する。
- **Prisma Client Rust:** `sqlx` の代替として検討する価値はあるが、今回は `sqlx` で進める。