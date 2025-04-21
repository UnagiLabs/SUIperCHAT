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

## 3. 実装ステップ

### 3.1. 依存関係の追加 (`cargo add`)

`suiperchat_streamer_app/src-tauri/` ディレクトリで以下の `cargo add` コマンドを実行して、必要な依存関係を追加します。これにより、互換性のある最新バージョンが `Cargo.toml` に自動的に追加されます。

```bash
cargo add sqlx --features runtime-tokio-native-tls,sqlite,chrono
cargo add chrono --features serde # 既に存在する場合は不要か確認
cargo add uuid --features v4,serde # セッションID生成用
# tokio, futures, serde, serde_json は既存のはずだが確認
```

コマンド実行後、`Cargo.toml` に意図通りに追加されたことを確認し、`cargo build` でビルド可能か確認します。

### 3.2. データベース接続管理

1.  **`AppState` の更新 (`src/state.rs`)**:
    - `AppState` 構造体に以下を追加します。
        - `db_pool: Arc<Mutex<Option<sqlx::SqlitePool>>>`
        - `current_session_id: Arc<Mutex<Option<String>>>`
    - `AppState::new()` で上記フィールドを `Arc::new(Mutex::new(None))` で初期化します。

2.  **接続プール初期化とセッション開始 (`src/main.rs` または `server_manager.rs`)**:
    - **DB接続プール初期化:** Tauri の `setup` フック内で非同期処理を実行します。
        - **DBパスの決定:**
            ```rust
            let db_path = if cfg!(debug_assertions) {
                // 開発ビルド時: プロジェクト内の相対パス
                std::path::PathBuf::from("../prisma/dev.db")
            } else {
                // リリースビルド時: アプリケーションデータディレクトリ
                let app_data_dir = tauri::api::path::app_data_dir(&app_handle.config())
                    .ok_or_else(|| "Failed to get app data directory".to_string())?;
                let db_dir = app_data_dir.join("data"); // dataサブディレクトリを作成
                std::fs::create_dir_all(&db_dir)
                    .map_err(|e| format!("Failed to create data directory: {}", e))?;
                db_dir.join("suiperchat_data.db") // DBファイル名
            };
            let db_url = format!("sqlite:{}", db_path.to_string_lossy());
            println!("Using database URL: {}", db_url);
            ```
            *注意:* 上記は `setup` フック内で `app_handle` が利用可能である想定です。非同期処理内で `app_handle` を渡す必要があります。
        - `sqlx::sqlite::SqlitePoolOptions::new().max_connections(5).connect(&db_url).await` で接続プールを作成します。
        - 作成したプールを `app_handle.state::<AppState>()` を使って `AppState` の `db_pool` に設定します。
        - 接続失敗時のエラーハンドリングを追加します。
    - **サーバー起動成功時 (セッション開始):** (`server_manager::run_servers` 内など)
        - `uuid::Uuid::new_v4().to_string()` で新しいセッションID (UUID) を生成します。
        - `database.rs` に `create_session(pool: &SqlitePool, session_id: &str) -> Result<(), sqlx::Error>` 関数を追加し、`Session` テーブルに `id = ?, started_at = now()` でレコードをINSERTします。
        - 生成したセッションIDを `AppState` の `current_session_id` に設定します。

3.  **セッション終了 (`server_manager.rs`)**:
    - **サーバー停止時:** (`stop_server` 内)
        - `AppState` から `current_session_id` を取得します (`lock().unwrap().take()` など)。
        - `database.rs` に `end_session(pool: &SqlitePool, session_id: &str) -> Result<(), sqlx::Error>` 関数を追加し、対応する `Session` レコードの `ended_at` を `now()` でUPDATEします。
        - `AppState` の `current_session_id` が `None` であることを確認します（`take()` でクリアされていればOK）。

### 3.3. データモデル定義 (`src/db_models.rs` - 新規作成)

- `prisma/schema.prisma` の `Message` および `Session` モデルに対応する Rust 構造体を定義します。
- `sqlx::FromRow` を derive し、フィールド名を Prisma スキーマに合わせます (`#[sqlx(rename = ...)]` など)。
- `chrono::DateTime<Utc>` を日時型に使用します。
- Prisma の `Float` 型は `f64` にマッピングします (`amount` フィールド)。

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
    // created_at: DateTime<Utc>, // @default(now()) は timestamp で代替可能
    // updated_at: DateTime<Utc>, // @updatedAt
}

#[derive(FromRow, Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Session {
    pub id: String,         // UUID
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    // 必要なら他の情報 (例: 配信タイトル) を追加
}

```

### 3.4. メッセージ保存ロジック (`src/database.rs` - 新規作成 & `src/ws_server/session.rs` 修正)

1.  **`database.rs` の作成**:
    - `save_message_db(pool: &SqlitePool, message: &Message) -> Result<(), sqlx::Error>` 関数を実装します。
    - `sqlx::query!` マクロを使用して `INSERT INTO Message (...) VALUES (...)` 文を実行します（`session_id` カラムも含む）。
    - セッション作成/終了用の関数 `create_session` と `end_session` もこのファイルに実装します。

2.  **`ws_server/session.rs` の修正**:
    - `WsSession` アクターの `started` メソッドで `AppState` から `current_session_id` を取得し、アクターの状態として保持します。
        - 取得できなかった場合（サーバー起動直後などタイミングの問題がありうる）のエラーハンドリング、またはリトライ処理を検討します。
    - `StreamHandler::handle` でテキストメッセージを受信・パースした後、`Message` 構造体を作成します。
        - `id` は `cuid::cuid()` か `uuid` で生成します。
        - `timestamp` は `chrono::Utc::now()` で設定します。
        - スーパーチャット/通常チャットに応じて `amount` 等を設定します。
        - **アクターが保持している `session_id` を設定します。**
    - 作成した `Message` オブジェクトを `database::save_message_db` に渡して非同期に保存処理を呼び出します (`tokio::spawn` を使用してアクターをブロックしないようにします)。
    - DB保存エラー時のログ出力等を追加します。

### 3.5. 履歴取得・検索コマンド (`src/commands/history.rs` - 新規作成 & `src/database.rs` 追記)

1.  **`database.rs` に追記**:
    - `fetch_messages(pool: &SqlitePool, limit: i64, offset: i64, ...) -> Result<Vec<Message>, sqlx::Error>` のような非同期関数を実装します。
    - `sqlx::query_as!` マクロを使用して `SELECT` 文を実行します。
    - `ORDER BY timestamp DESC`, `LIMIT ?`, `OFFSET ?` を含めます。
    - 将来のフィルタリング (`WHERE` 句) を考慮した設計にします。

2.  **`commands/history.rs` の作成**:
    - Tauri コマンド `get_message_history(limit: i64, offset: i64, ..., app_state: State<'_, AppState>) -> Result<Vec<Message>, String>` を定義します。
    - `AppState` から `db_pool` を取得します。
    - `database::fetch_messages` を呼び出し、結果をフロントエンドに返します。
    - エラーハンドリングを実装します。
    - `src/commands/mod.rs` に `pub mod history;` と `pub use history::get_message_history;` を追加します。

### 3.6. エラーハンドリング

- 各ステップで発生しうるエラー（DB接続、クエリ実行、Mutexロック、非同期処理など）を考慮し、`Result` 型と `?` 演算子、`map_err` を活用してエラーを伝播させます。
- Tauriコマンドの戻り値は `Result<T, String>` とし、フロントエンドでエラーメッセージを表示できるようにします。
- 詳細なエラー情報はログに出力します (`log` クレートや `tracing` クレートの利用を検討)。

### 3.7. Prisma マイグレーション

- スキーマに変更が必要な場合は `prisma/schema.prisma` を編集し、`npx prisma migrate dev --name <migration_name>` を実行してマイグレーションファイルを生成・適用します。
- Rust の `db_models.rs` もスキーマ変更に合わせて更新します。

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