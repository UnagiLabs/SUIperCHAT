# Prisma 依存削除 移行計画書

## 1. 目的

- `suiperchat_streamer_app` の Rust バックエンドから Prisma CLI および Prisma Migrate への依存を削除する。
- データベーススキーマの定義とマイグレーション管理を Rust コード (sqlx) ベースに移行する。
- アプリケーション初回起動時に、エンドユーザー環境で必要な SQLite テーブル (`sessions`, `messages`) が自動的に作成されるようにする。

## 2. 現状の課題

- 現在の SQLite 連携実装は、データベーススキーマの作成・変更に `prisma migrate dev` コマンドの実行を前提としている。
- Tauri アプリケーションとしてエンドユーザーに配布する際、ユーザーに `prisma migrate` の実行を要求することは現実的ではない。
- 初回起動時にテーブルが存在しないため、データベース操作（セッション作成、メッセージ保存など）で `no such table` エラーが発生する。

## 3. 移行方針

- Prisma CLI および Prisma Migrate への依存を完全に削除する。
- スキーマ定義の信頼できる情報源 (Source of Truth) を Rust コード（`db_models.rs` および起動時の `CREATE TABLE` 文）に移す。
- アプリケーション起動時に `sqlx` を使用して `CREATE TABLE IF NOT EXISTS` を実行し、必要なテーブルを初期化する。

## 4. 移行後の状態

- `prisma` ディレクトリは不要になる。
- `package.json` から `prisma` 関連の依存が削除される。
- スキーマ定義は `db_models.rs` と `lib.rs` 内の `CREATE TABLE` 文で管理される。
- アプリケーションは初回起動時に自己完結的にデータベースを初期化できる。
- 今後のスキーマ変更は、Rust コード内での `ALTER TABLE` 文の実行など、手動でのマイグレーション実装が必要になる。

## 5. 移行ステップ

### ステップ 1: スキーマ定義の確定と SQL 化

-   **タスク:**
    -   現在の `prisma/schema.prisma`, `src-tauri/src/db_models.rs`, 最新のマイグレーション SQL (`prisma/migrations/.../migration.sql`) を参照し、`sessions` と `messages` テーブルの最終的なスキーマ（カラム名、型、制約: `NOT NULL`, `DEFAULT`, `FOREIGN KEY` 等）を確定する。
    -   確定したスキーマに基づき、SQLite で実行可能な `CREATE TABLE IF NOT EXISTS sessions (...)` と `CREATE TABLE IF NOT EXISTS messages (...)` の SQL 文を作成する。
        -   `id`: `TEXT PRIMARY KEY NOT NULL`
        -   `DateTime` 型のカラム (`started_at`, `ended_at`, `created_at`, `updated_at`, `timestamp`): `TEXT NOT NULL` または `TEXT` (NULL許容の場合)
        -   `Float` 型のカラム (`amount`): `REAL DEFAULT 0`
        -   `String` 型のカラム: `TEXT NOT NULL` または `TEXT`
        -   外部キー制約: `FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE`
-   **成果物:** 以下の実行可能な `CREATE TABLE IF NOT EXISTS` SQL 文 (2つ)。
    ```sql
    -- sessions テーブル
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    ```
    ```sql
    -- messages テーブル
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
    ```
-   **確認手段:** 作成したSQL文が `db_models.rs` の構造体定義と矛盾しないか目視確認する。SQLiteクライアントツール等で実際に実行し、意図通りにテーブルが作成されるか確認する (任意)。
-   **コミット目安:** SQL文が確定したらコミット。
-   **コミットタイトル案:** `[docs] Prisma依存削除の移行計画書を作成`

### ステップ 2: 起動時のテーブル作成実装

-   **タスク:**
    -   `src-tauri/src/lib.rs` の `setup` フック内で、`SqlitePool` の初期化が成功した直後に、ステップ1で作成した `CREATE TABLE IF NOT EXISTS` SQL 文を `sqlx::query().execute(&pool)` を使って実行する処理を追加する。
    -   処理は非同期 (`tauri::async_runtime::spawn` または直接 `await`) で実行する。
    -   テーブル作成処理の成功・失敗ログを出力する。エラーが発生してもアプリケーションの起動は継続する（ログで通知する）。
-   **変更ファイル:** `src-tauri/src/lib.rs`
-   **確認手段:**
    -   `cargo check` でコンパイルエラーがないことを確認。
    -   既存のDBファイル (`dev.db` 等) を削除してから `cargo tauri dev` を実行し、コンソールにテーブル作成のログが出力されることを確認。
    -   SQLiteクライアントツール等でDBファイルを開き、`sessions` と `messages` テーブルが正しく作成されていることを確認。
-   **コミット目安:** 起動時のテーブル作成実装後。
-   **コミットタイトル案:** `[feat] アプリ起動時にDBテーブルを自動作成する処理を追加`

### ステップ 3: 既存 DB 操作コードの確認 (念のため)

-   **タスク:**
    -   `src-tauri/src/database.rs` 内の `INSERT`, `UPDATE`, `SELECT` 文で使用されているテーブル名 (`sessions`, `messages`) とカラム名が、ステップ1で確定したスキーマと一致していることを再確認する。
-   **変更ファイル:** (おそらく変更なし)
-   **確認手段:** コードレビューまたは目視確認。
-   **コミット目安:** (変更があれば) ステップ2と同時、または別途コミット。
-   **コミットタイトル案:** `[refactor] DB操作コードのテーブル名/カラム名を確認・修正` (変更があった場合)

### ステップ 4: テストコードの修正

-   **タスク:**
    -   `src-tauri/src/database.rs` の `#[cfg(test)]` 内にあるテスト用ヘルパー関数 (`setup_test_db`, `setup_message_table`) を修正または削除する。
    -   **推奨:** ヘルパー関数を削除し、各テスト (`#[sqlx::test]`) の開始時にインメモリ DB が使われることを前提とする（sqlx-cli がマイグレーションを実行してくれる場合がある、またはステップ2の起動時処理がインメモリDBにも適用されるか確認）。
    -   **代替案:** ヘルパー関数を残す場合、内部の `CREATE TABLE` 文をステップ2で実装するものと**完全に同一**にする。
-   **変更ファイル:** `src-tauri/src/database.rs`
-   **確認手段:** `cargo test` を実行し、全てのテストがパスすることを確認。
-   **コミット目安:** テストコード修正後。
-   **コミットタイトル案:** `[refactor] DBテストコードからテーブル作成処理を削除/修正`

### ステップ 5: Prisma 関連ファイルの削除

-   **タスク:**
    -   プロジェクトルートの `prisma` ディレクトリを削除する。
    -   `suiperchat_streamer_app/package.json` ファイルを開き、`devDependencies` から `@prisma/client` と `prisma` の行を削除する。その後 `npm install` または `yarn install` を実行して `node_modules` と `package-lock.json` を更新する。
    -   ルートディレクトリの `.env` ファイルから `DATABASE_URL` の行を削除する（Rust側でパス解決するため）。
    -   `docs/sqlite_integration_plan.md` や他の関連ドキュメントから、Prisma Migrate に関する記述を削除・修正する。
-   **変更ファイル:** `package.json`, `.env`, `docs/*.md`
-   **削除対象:** `prisma` ディレクトリ
-   **確認手段:**
    -   `prisma` ディレクトリが存在しないことを確認。
    -   `package.json` からprisma関連が削除されていることを確認。
    -   `cargo check` が成功することを確認 (Prisma関連のコードが残っていないか)。
-   **コミット目安:** Prisma関連ファイル削除後。
-   **コミットタイトル案:** `[chore] Prisma関連のファイルと依存関係を削除`

### ステップ 6: 動作確認

-   **タスク:**
    -   `suiperchat_streamer_app/prisma` ディレクトリ内に存在する可能性のある `dev.db*` ファイルを削除する。
    -   `suiperchat_streamer_app/src-tauri` ディレクトリで `cargo clean` を実行する (任意)。
    -   `cargo tauri dev` を実行する。
        -   初回起動時にコンソールにテーブル作成関連のログが出力されることを確認。
        -   WebSocket でメッセージを送受信し、DB 保存および履歴取得（実装されていれば）がエラーなく動作することを確認。
    -   `cargo tauri build` を実行する。
    -   生成されたリリース版アプリケーション (`target/release/app` など) を実行する。
        -   初回起動時にテーブルが作成され、正常に動作することを確認。
    -   `cargo test` を実行し、全てのテストがパスすることを確認する。
-   **確認手段:** 上記タスクの各項目が成功すること。特に、クリーンな状態からの初回起動でエラーなく動作すること。
-   **コミット目安:** 全ての動作確認が完了したら、この一連の移行作業をマージするための最終コミット。
-   **コミットタイトル案:** `[feat] Prisma依存を削除し、DB初期化をRustコードに移行` (または一連のコミットをまとめるメッセージ)

## 6. 注意点・今後の課題

-   **スキーママイグレーション:** 今後、データベーススキーマ（テーブル構造）を変更する必要が生じた場合、Prisma Migrate のような自動マイグレーションツールは利用できない。以下のいずれかの方法で対応する必要がある。
    -   `ALTER TABLE` 文を含むマイグレーションロジックを Rust コード (例: `lib.rs` の起動時処理) に追加実装する。バージョン管理の仕組みも必要になる可能性がある。
    -   マイグレーション用の SQL ファイルを別途用意し、それを実行する仕組みを実装する。
-   **スキーマ定義の管理:** スキーマの定義情報が Rust コード (モデル、`CREATE TABLE` 文) に分散するため、ドキュメント等で最新のスキーマ構造を明確に管理することがより重要になる。
-   **開発ツール:** Prisma Studio のような GUI データベース管理ツールは利用できなくなる（汎用の SQLite クライアントツールは利用可能）。