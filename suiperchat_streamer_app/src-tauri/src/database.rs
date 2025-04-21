//! データベース操作を行うモジュール
//!
//! SQLiteデータベースへの接続管理、メッセージやセッションの保存・取得などの操作を提供する

use crate::db_models::Message;
use chrono::Utc;
use sqlx::{sqlite::SqlitePool, Error as SqlxError};

/// セッションをデータベースに作成する
///
/// 新しい配信セッションの開始をデータベースに記録します。
///
/// # 引数
/// * `pool` - SQLiteデータベース接続プール
/// * `session_id` - 生成されたセッションID
///
/// # 戻り値
/// * `Result<(), SqlxError>` - 成功時は `Ok(())`, エラー時は `SqlxError`
///
/// # エラー
/// - データベース接続エラー
/// - SQLクエリ実行エラー
pub async fn create_session(pool: &SqlitePool, session_id: &str) -> Result<(), SqlxError> {
    let now = Utc::now();

    println!(
        "データベースにセッションを作成: ID={}, 開始時刻={}",
        session_id, now
    );

    sqlx::query(
        r#"
        INSERT INTO Session (id, started_at)
        VALUES (?, ?)
        "#,
    )
    .bind(session_id)
    .bind(now)
    .execute(pool)
    .await?;

    println!("セッション作成完了: {}", session_id);

    Ok(())
}

/// セッションをデータベースで終了する
///
/// 配信セッションの終了をデータベースに記録します。
///
/// # 引数
/// * `pool` - SQLiteデータベース接続プール
/// * `session_id` - 終了するセッションID
///
/// # 戻り値
/// * `Result<(), SqlxError>` - 成功時は `Ok(())`, エラー時は `SqlxError`
///
/// # エラー
/// - データベース接続エラー
/// - SQLクエリ実行エラー
/// - 指定されたセッションIDが存在しない場合
pub async fn end_session(pool: &SqlitePool, session_id: &str) -> Result<(), SqlxError> {
    let now = Utc::now();

    println!(
        "データベース内のセッションを終了: ID={}, 終了時刻={}",
        session_id, now
    );

    let result = sqlx::query(
        r#"
        UPDATE Session
        SET ended_at = ?
        WHERE id = ?
        "#,
    )
    .bind(now)
    .bind(session_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        println!(
            "警告: セッションID{}の更新に失敗しました（レコードが見つかりません）",
            session_id
        );
    } else {
        println!("セッション終了処理完了: {}", session_id);
    }

    Ok(())
}

/// メッセージをデータベースに保存する
///
/// 受信したチャットメッセージまたはスーパーチャットをデータベースに記録します。
///
/// # 引数
/// * `pool` - SQLiteデータベース接続プール
/// * `message` - 保存するメッセージオブジェクト
///
/// # 戻り値
/// * `Result<(), SqlxError>` - 成功時は `Ok(())`, エラー時は `SqlxError`
///
/// # エラー
/// - データベース接続エラー
/// - SQLクエリ実行エラー
pub async fn save_message_db(pool: &SqlitePool, message: &Message) -> Result<(), SqlxError> {
    println!(
        "メッセージをデータベースに保存: ID={}, 送信者={}, セッションID={}",
        message.id,
        message.display_name,
        message.session_id.as_deref().unwrap_or("不明")
    );

    sqlx::query(
        r#"
        INSERT INTO Message (id, timestamp, display_name, message, amount, tx_hash, wallet_address, session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&message.id)
    .bind(message.timestamp)
    .bind(&message.display_name)
    .bind(&message.content)
    .bind(message.amount)
    .bind(&message.tx_hash)
    .bind(&message.wallet_address)
    .bind(&message.session_id)
    .execute(pool)
    .await?;

    println!("メッセージ保存完了: {}", message.id);

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::db_models::{Message, Session};

    use super::*;
    use uuid::Uuid;

    /// テスト用データベースにSessionテーブルを作成する
    async fn setup_test_db(pool: &SqlitePool) -> Result<(), SqlxError> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS Session (
                id TEXT PRIMARY KEY,
                started_at TIMESTAMP NOT NULL,
                ended_at TIMESTAMP
            )
            "#,
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// テスト用データベースにMessageテーブルを作成する
    async fn setup_message_table(pool: &SqlitePool) -> Result<(), SqlxError> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS Message (
                id TEXT PRIMARY KEY,
                timestamp TIMESTAMP NOT NULL,
                display_name TEXT NOT NULL,
                message TEXT NOT NULL,
                amount REAL,
                tx_hash TEXT,
                wallet_address TEXT,
                session_id TEXT,
                FOREIGN KEY (session_id) REFERENCES Session(id)
            )
            "#,
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// `create_session`関数のテスト
    #[sqlx::test]
    async fn test_create_session(pool: SqlitePool) -> Result<(), SqlxError> {
        // テスト用DBのセットアップ
        setup_test_db(&pool).await?;

        // テスト用のセッションIDを生成
        let session_id = Uuid::new_v4().to_string();

        // セッション作成
        create_session(&pool, &session_id).await?;

        // セッションがDBに正しく保存されたか確認
        let session: Session = sqlx::query_as::<_, Session>("SELECT * FROM Session WHERE id = ?")
            .bind(&session_id)
            .fetch_one(&pool)
            .await?;

        assert_eq!(session.id, session_id);
        assert!(session.ended_at.is_none());

        Ok(())
    }

    /// `end_session`関数のテスト
    #[sqlx::test]
    async fn test_end_session(pool: SqlitePool) -> Result<(), SqlxError> {
        // テスト用DBのセットアップ
        setup_test_db(&pool).await?;

        // テスト用のセッションIDを生成
        let session_id = Uuid::new_v4().to_string();

        // セッション作成
        create_session(&pool, &session_id).await?;

        // セッション終了
        end_session(&pool, &session_id).await?;

        // セッションが正しく更新されたか確認
        let session: Session = sqlx::query_as::<_, Session>("SELECT * FROM Session WHERE id = ?")
            .bind(&session_id)
            .fetch_one(&pool)
            .await?;

        assert_eq!(session.id, session_id);
        assert!(session.ended_at.is_some());

        Ok(())
    }

    /// `save_message_db`関数のテスト
    #[sqlx::test]
    async fn test_save_message_db(pool: SqlitePool) -> Result<(), SqlxError> {
        // テスト用DBのセットアップ
        setup_test_db(&pool).await?;
        setup_message_table(&pool).await?;

        // テスト用のセッションを作成
        let session_id = uuid::Uuid::new_v4().to_string();
        create_session(&pool, &session_id).await?;

        // テスト用のメッセージを作成
        let message = Message {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            display_name: "テストユーザー".to_string(),
            content: "これはテストメッセージです".to_string(),
            amount: Some(10.5),
            tx_hash: Some("0x123456789abcdef".to_string()),
            wallet_address: Some("0xabcdef123456789".to_string()),
            session_id: Some(session_id.clone()),
        };

        // メッセージを保存
        save_message_db(&pool, &message).await?;

        // メッセージがDBに正しく保存されたか確認
        let saved_message: Message =
            sqlx::query_as::<_, Message>("SELECT * FROM Message WHERE id = ?")
                .bind(&message.id)
                .fetch_one(&pool)
                .await?;

        assert_eq!(saved_message.id, message.id);
        assert_eq!(saved_message.display_name, message.display_name);
        assert_eq!(saved_message.content, message.content);
        assert_eq!(saved_message.amount, message.amount);
        assert_eq!(saved_message.tx_hash, message.tx_hash);
        assert_eq!(saved_message.wallet_address, message.wallet_address);
        assert_eq!(saved_message.session_id, message.session_id);

        Ok(())
    }
}
