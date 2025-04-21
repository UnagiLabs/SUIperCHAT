//! # データベース操作モジュール
//!
//! このモジュールはSQLiteデータベースへの接続や操作を行う関数を提供します。
//! メッセージの保存、セッションの作成・終了、データの取得などの機能を実装しています。
//! sqlxを使用して非同期でデータベース操作を行います。

use crate::db_models::{Message, Session};
use log::info;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use std::path::Path;

/// ## データベース接続プールの作成
///
/// 指定されたデータベースパスに基づいてSQLite接続プールを作成します。
///
/// ### 引数
/// * `db_path` - データベースファイルパス
/// * `max_connections` - 最大接続数
///
/// ### 戻り値
/// * `Result<Pool<Sqlite>, sqlx::Error>` - 成功時は接続プール、失敗時はエラー
pub async fn create_db_pool(
    db_path: &Path,
    max_connections: u32,
) -> Result<Pool<Sqlite>, sqlx::Error> {
    // SQLiteのURLは3つのスラッシュが必要: sqlite:///path/to/db
    let db_url = format!("sqlite:///{}", db_path.to_string_lossy());
    info!("データベース接続を確立: {}", db_url);

    SqlitePoolOptions::new()
        .max_connections(max_connections)
        .connect(&db_url)
        .await
}

/// ## セッション作成
///
/// 新しい配信セッションをデータベースに作成します。
///
/// ### 引数
/// * `pool` - SQLite接続プール
///
/// ### 戻り値
/// * `Result<i32, sqlx::Error>` - 成功時は作成されたセッションID、失敗時はエラー
pub async fn create_session(pool: &Pool<Sqlite>) -> Result<i32, sqlx::Error> {
    info!("新しいセッションを作成します");

    // トランザクション開始
    let mut tx = pool.begin().await?;

    // セッション作成
    let result = sqlx::query(
        r#"
        INSERT INTO sessions (start_time, created_at, updated_at)
        VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
        "#,
    )
    .fetch_one(&mut *tx)
    .await?;

    let session_id = result.try_get::<i32, _>("id")?;

    // トランザクションコミット
    tx.commit().await?;

    info!("セッションを作成しました (ID: {})", session_id);
    Ok(session_id)
}

/// ## セッション終了
///
/// 指定されたセッションIDの配信セッションを終了状態に更新します。
///
/// ### 引数
/// * `pool` - SQLite接続プール
/// * `session_id` - 終了するセッションID
///
/// ### 戻り値
/// * `Result<(), sqlx::Error>` - 成功時は空のタプル、失敗時はエラー
pub async fn end_session(pool: &Pool<Sqlite>, session_id: i32) -> Result<(), sqlx::Error> {
    info!("セッションを終了します (ID: {})", session_id);

    sqlx::query(
        r#"
        UPDATE sessions
        SET end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        "#,
    )
    .bind(session_id)
    .execute(pool)
    .await?;

    info!("セッションを終了しました (ID: {})", session_id);
    Ok(())
}

/// ## メッセージ保存
///
/// チャットメッセージまたはスーパーチャットメッセージをデータベースに保存します。
///
/// ### 引数
/// * `pool` - SQLite接続プール
/// * `message` - 保存するメッセージオブジェクト
///
/// ### 戻り値
/// * `Result<i32, sqlx::Error>` - 成功時は保存されたメッセージID、失敗時はエラー
pub async fn save_message(pool: &Pool<Sqlite>, message: &Message) -> Result<i32, sqlx::Error> {
    info!(
        "メッセージを保存します (セッションID: {}, ユーザー: {})",
        message.session_id, message.display_name
    );

    let result = sqlx::query(
        r#"
        INSERT INTO messages (
            session_id, wallet_address, display_name, message, 
            amount, tx_hash, timestamp
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING id
        "#,
    )
    .bind(message.session_id)
    .bind(&message.wallet_address)
    .bind(&message.display_name)
    .bind(&message.message)
    .bind(message.amount)
    .bind(&message.tx_hash)
    .bind(message.timestamp)
    .fetch_one(pool)
    .await?;

    let message_id = result.try_get::<i32, _>("id")?;
    info!("メッセージを保存しました (ID: {})", message_id);
    Ok(message_id)
}

/// ## メッセージ履歴取得
///
/// 指定されたセッションのメッセージ履歴を取得します。
/// 結果はタイムスタンプの降順（新しい順）で返されます。
///
/// ### 引数
/// * `pool` - SQLite接続プール
/// * `session_id` - 取得するセッションのID
/// * `limit` - 取得する最大メッセージ数
/// * `offset` - ページネーション用のオフセット
///
/// ### 戻り値
/// * `Result<Vec<Message>, sqlx::Error>` - 成功時はメッセージのベクター、失敗時はエラー
pub async fn fetch_messages(
    pool: &Pool<Sqlite>,
    session_id: i32,
    limit: i64,
    offset: i64,
) -> Result<Vec<Message>, sqlx::Error> {
    info!(
        "メッセージ履歴を取得します (セッションID: {}, limit: {}, offset: {})",
        session_id, limit, offset
    );

    let messages = sqlx::query_as::<_, Message>(
        r#"
        SELECT 
            id, session_id, wallet_address, display_name, 
            message, amount, tx_hash, timestamp
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
        "#,
    )
    .bind(session_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    info!("{}件のメッセージを取得しました", messages.len());
    Ok(messages)
}

/// ## セッション一覧取得
///
/// 配信セッションの一覧を取得します。
/// 結果は開始時刻の降順（新しい順）で返されます。
///
/// ### 引数
/// * `pool` - SQLite接続プール
/// * `limit` - 取得する最大セッション数
/// * `offset` - ページネーション用のオフセット
///
/// ### 戻り値
/// * `Result<Vec<Session>, sqlx::Error>` - 成功時はセッションのベクター、失敗時はエラー
pub async fn fetch_sessions(
    pool: &Pool<Sqlite>,
    limit: i64,
    offset: i64,
) -> Result<Vec<Session>, sqlx::Error> {
    info!(
        "セッション一覧を取得します (limit: {}, offset: {})",
        limit, offset
    );

    let sessions = sqlx::query_as::<_, Session>(
        r#"
        SELECT 
            id, start_time, end_time, created_at, updated_at
        FROM sessions
        ORDER BY start_time DESC
        LIMIT ? OFFSET ?
        "#,
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    info!("{}件のセッションを取得しました", sessions.len());
    Ok(sessions)
}

/// ## 最新のアクティブセッション取得
///
/// 現在アクティブ（終了していない）なセッションを取得します。
/// 複数ある場合は最新のセッションを返します。
///
/// ### 引数
/// * `pool` - SQLite接続プール
///
/// ### 戻り値
/// * `Result<Option<Session>, sqlx::Error>` - 成功時はセッションのオプション（なければNone）、失敗時はエラー
pub async fn fetch_active_session(pool: &Pool<Sqlite>) -> Result<Option<Session>, sqlx::Error> {
    info!("アクティブなセッションを検索します");

    let session = sqlx::query_as::<_, Session>(
        r#"
        SELECT 
            id, start_time, end_time, created_at, updated_at
        FROM sessions
        WHERE end_time IS NULL
        ORDER BY start_time DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await?;

    match &session {
        Some(s) => info!("アクティブなセッションを発見しました (ID: {})", s.id),
        None => info!("アクティブなセッションは見つかりませんでした"),
    }

    Ok(session)
}
