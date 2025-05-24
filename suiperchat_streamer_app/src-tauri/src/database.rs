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

    // セッション作成をログに記録（重要な操作のため保持）
    println!("データベースセッション作成: {}", session_id);

    sqlx::query(
        r#"
        INSERT INTO sessions (id, started_at, created_at, updated_at) -- created_at, updated_at を追加
        VALUES (?, ?, ?, ?)
        "#,
    )
    .bind(session_id)
    .bind(now.to_rfc3339()) // started_at
    .bind(now.to_rfc3339()) // created_at
    .bind(now.to_rfc3339()) // updated_at
    .execute(pool)
    .await?;

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

    println!("データベースセッション終了: {}", session_id);

    let result = sqlx::query(
        r#"
        UPDATE sessions -- テーブル名を sessions に変更
        SET ended_at = ?
        WHERE id = ?
        "#,
    )
    .bind(now.to_rfc3339()) // DateTime<Utc>をRFC3339形式の文字列に変換
    .bind(session_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        eprintln!("警告: セッションID{}が見つかりません", session_id);
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
/// - セッションIDが不足している場合
pub async fn save_message_db(pool: &SqlitePool, message: &Message) -> Result<(), SqlxError> {
    // セッションIDの存在確認（警告のみ表示）
    if message.session_id.is_none() {
        eprintln!("警告: メッセージにセッションIDが未設定");
    }

    let _result = sqlx::query(
        r#"
        INSERT INTO messages (id, timestamp, display_name, message, amount, coin, tx_hash, wallet_address, session_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&message.id)
    .bind(message.timestamp)
    .bind(&message.display_name)
    .bind(&message.content)
    .bind(message.amount)
    .bind(&message.coin)
    .bind(&message.tx_hash)
    .bind(&message.wallet_address)
    .bind(&message.session_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// メッセージの履歴をデータベースから取得する
///
/// 指定された制限とオフセットに基づいてメッセージを取得します。
/// 結果は通常、タイムスタンプの降順（新しい順）で返されます。
///
/// # 引数
/// * `pool` - SQLiteデータベース接続プール
/// * `limit` - 取得するメッセージの最大数（1-1000、デフォルトは100）
/// * `offset` - 結果セットのオフセット（ページネーション用、0以上）
///
/// # 戻り値
/// * `Result<Vec<Message>, SqlxError>` - 成功時はメッセージのベクター、エラー時は `SqlxError`
///
/// # エラー
/// - データベース接続エラー
/// - SQLクエリ実行エラー
/// - 無効な入力値（例: 負の値）は自動的に安全な値に調整されます
pub async fn fetch_messages(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
) -> Result<Vec<Message>, SqlxError> {
    // パラメータの検証と調整
    let safe_limit = if limit <= 0 {
        100
    } else if limit > 1000 {
        1000
    } else {
        limit
    };

    let safe_offset = if offset < 0 { 0 } else { offset };

    let messages = sqlx::query_as::<_, Message>(
        r#"
        SELECT 
            id, 
            timestamp, 
            display_name, 
            message, 
            amount, 
            coin,
            tx_hash, 
            wallet_address, 
            session_id
        FROM messages
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
        "#,
    )
    .bind(safe_limit)
    .bind(safe_offset)
    .fetch_all(pool)
    .await?;

    // 詳細ログは削除

    Ok(messages)
}

/// セッションIDに基づいてメッセージを取得する
///
/// 指定されたセッションIDに属するメッセージを取得し、オプションでタイムスタンプによるフィルタリングを行います。
///
/// # 引数
/// * `pool` - SQLiteデータベース接続プール
/// * `session_id` - メッセージを取得する対象のセッションID
/// * `limit` - 取得するメッセージの最大数（1-1000）
/// * `before_timestamp` - このタイムスタンプより前のメッセージのみを取得（ミリ秒単位のUnixタイムスタンプ）
///
/// # 戻り値
/// * `Result<Vec<Message>, SqlxError>` - 成功時はメッセージのベクター、エラー時は `SqlxError`
///
/// # エラー
/// - データベース接続エラー
/// - SQLクエリ実行エラー
pub async fn get_messages_by_session_id(
    pool: &SqlitePool,
    session_id: &str,
    limit: i64,
    before_timestamp: Option<i64>,
) -> Result<Vec<Message>, SqlxError> {
    // パラメータの検証と調整
    let safe_limit = if limit <= 0 {
        50
    } else if limit > 1000 {
        1000
    } else {
        limit
    };

    // クエリを構築
    let mut query_builder = sqlx::QueryBuilder::new(
        "SELECT id, timestamp, display_name, message, amount, coin, tx_hash, wallet_address, session_id FROM messages WHERE session_id = ",
    );

    query_builder.push_bind(session_id);

    // before_timestampが指定されていれば条件を追加
    if let Some(timestamp) = before_timestamp {
        query_builder.push(" AND timestamp < ");
        query_builder.push_bind(timestamp);
    }

    // ORDER BY句を追加（最初は新しいものから取得）
    query_builder.push(" ORDER BY timestamp DESC LIMIT ");
    query_builder.push_bind(safe_limit + 1); // +1することで、さらに古いログがあるかの判断材料にする

    // クエリを実行
    let query = query_builder.build_query_as::<Message>();
    let mut messages = query.fetch_all(pool).await?;

    // timestampの昇順（古い順）にソート
    messages.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    // メッセージインデックスの確認と作成
    ensure_message_index(pool).await?;

    Ok(messages)
}

/// メッセージテーブルにインデックスが存在することを確認し、必要に応じて作成する
///
/// # 引数
/// * `pool` - SQLiteデータベース接続プール
///
/// # 戻り値
/// * `Result<(), SqlxError>` - 成功時は `Ok(())`, エラー時は `SqlxError`
async fn ensure_message_index(pool: &SqlitePool) -> Result<(), SqlxError> {
    // インデックスを作成
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_messages_session_timestamp ON messages(session_id, timestamp)",
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// 配信者用のセッションごとのメッセージ取得関数（既存の関数を拡張）
pub async fn get_messages_by_session_id_with_options(
    pool: &SqlitePool,
    session_id: &str,
    limit: i64,
    offset: Option<i64>,
    sort_asc: bool,
) -> Result<Vec<Message>, sqlx::Error> {
    println!("get_messages_by_session_id_with_options呼び出し: session_id={}, limit={}, offset={:?}, sort_asc={}", 
        session_id, limit, offset, sort_asc);

    // ソート順の文字列を決定
    let order_by = if sort_asc { "ASC" } else { "DESC" };

    // offsetが指定されていれば通常のオフセットベースのページネーション
    if let Some(offset_value) = offset {
        let query = format!(
            "SELECT * FROM messages 
            WHERE session_id = $1 
            ORDER BY timestamp {} 
            LIMIT $2 OFFSET $3",
            order_by
        );

        println!("SQLクエリ実行: {}", query);
        println!(
            "パラメータ: session_id={}, limit={}, offset={}",
            session_id, limit, offset_value
        );

        let result = sqlx::query_as::<_, Message>(&query)
            .bind(session_id)
            .bind(limit)
            .bind(offset_value)
            .fetch_all(pool)
            .await;

        match &result {
            Ok(messages) => println!("取得されたメッセージ数: {}", messages.len()),
            Err(e) => println!("SQLクエリエラー: {}", e),
        }

        result
    } else {
        println!("offset=Noneのため、fetch_messagesを使用してフィルタリング実行");
        // offsetが指定されていなければ既存のロジックを活用（before_timestampベース）
        // この場合は常に昇順とする（既存実装と整合性をとるため）
        // 一時的な回避策: fetch_messages関数を使用
        let result = fetch_messages(pool, limit, 0).await.map(|msgs| {
            println!("fetch_messagesで取得したメッセージ数: {}", msgs.len());
            // セッションIDでフィルタリング
            let filtered: Vec<Message> = msgs
                .into_iter()
                .filter(|msg| {
                    let msg_session_id = msg.session_id.as_deref().unwrap_or("");
                    let matches = msg_session_id == session_id;
                    if !matches {
                        println!("フィルタリングで除外: {} != {}", msg_session_id, session_id);
                    }
                    matches
                })
                .collect();
            println!("フィルタリング後のメッセージ数: {}", filtered.len());
            filtered
        });
        result
    }
}

/// 過去のコメント閲覧用に、データベースに存在する全てのユニークな `session_id` を取得する関数
pub async fn get_distinct_session_ids(pool: &SqlitePool) -> Result<Vec<String>, sqlx::Error> {
    let query = "SELECT DISTINCT session_id FROM messages WHERE session_id IS NOT NULL";

    let rows = sqlx::query_as::<_, (String,)>(query)
        .fetch_all(pool)
        .await?;

    // タプルの最初の要素を取り出してVec<String>に変換
    let session_ids = rows.into_iter().map(|(id,)| id).collect();

    Ok(session_ids)
}

#[cfg(test)]
mod tests {
    use crate::db_models::{Message, Session};
    use crate::{CREATE_MESSAGES_TABLE_SQL, CREATE_SESSIONS_TABLE_SQL};

    use super::*;
    use uuid::Uuid;

    /// `create_session`関数のテスト
    #[sqlx::test]
    async fn test_create_session(pool: SqlitePool) -> Result<(), SqlxError> {
        // テスト用DBのセットアップ
        sqlx::query(CREATE_SESSIONS_TABLE_SQL)
            .execute(&pool)
            .await?;

        // テスト用のセッションIDを生成
        let session_id = Uuid::new_v4().to_string();

        // セッション作成
        create_session(&pool, &session_id).await?;

        // セッションがDBに正しく保存されたか確認
        let session: Session = sqlx::query_as::<_, Session>("SELECT * FROM sessions WHERE id = ?") // テーブル名を sessions に変更
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
        sqlx::query(CREATE_SESSIONS_TABLE_SQL)
            .execute(&pool)
            .await?;

        // テスト用のセッションIDを生成
        let session_id = Uuid::new_v4().to_string();

        // セッション作成
        create_session(&pool, &session_id).await?;

        // セッション終了
        end_session(&pool, &session_id).await?;

        // セッションが正しく更新されたか確認
        let session: Session = sqlx::query_as::<_, Session>("SELECT * FROM sessions WHERE id = ?") // テーブル名を sessions に変更
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
        sqlx::query(CREATE_SESSIONS_TABLE_SQL)
            .execute(&pool)
            .await?;
        sqlx::query(CREATE_MESSAGES_TABLE_SQL)
            .execute(&pool)
            .await?;

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
            coin: Some("SUI".to_string()),
            tx_hash: Some("0x123456789abcdef".to_string()),
            wallet_address: Some("0xabcdef123456789".to_string()),
            session_id: Some(session_id.clone()),
        };

        // メッセージを保存
        save_message_db(&pool, &message).await?;

        // メッセージがDBに正しく保存されたか確認
        let saved_message: Message =
            sqlx::query_as::<_, Message>("SELECT * FROM messages WHERE id = ?") // テーブル名を messages に変更
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

    /// `fetch_messages`関数のテスト
    #[sqlx::test]
    async fn test_fetch_messages(pool: SqlitePool) -> Result<(), SqlxError> {
        // テスト用DBのセットアップ
        sqlx::query(CREATE_SESSIONS_TABLE_SQL)
            .execute(&pool)
            .await?;
        sqlx::query(CREATE_MESSAGES_TABLE_SQL)
            .execute(&pool)
            .await?;

        // テスト用のセッションIDを生成
        let session_id = Uuid::new_v4().to_string();

        // セッション作成
        create_session(&pool, &session_id).await?;

        // テスト用のメッセージを5件作成して保存
        let mut test_messages = Vec::new();
        for i in 1..=5 {
            let message = Message {
                id: Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                display_name: format!("テストユーザー{}", i),
                content: format!("テストメッセージ本文{}", i),
                amount: if i % 2 == 0 {
                    Some(i as f64 * 10.0)
                } else {
                    None
                },
                coin: if i % 2 == 0 {
                    Some("SUI".to_string())
                } else {
                    None
                },
                tx_hash: if i % 2 == 0 {
                    Some(format!("tx_hash_{}", i))
                } else {
                    None
                },
                wallet_address: if i % 2 == 0 {
                    Some(format!("wallet_{}", i))
                } else {
                    None
                },
                session_id: Some(session_id.clone()),
            };
            test_messages.push(message.clone());
            save_message_db(&pool, &message).await?;
        }

        // メッセージを取得し、結果を検証

        // 全件取得 (limit=10, offset=0)
        let all_messages = fetch_messages(&pool, 10, 0).await?;
        assert_eq!(
            all_messages.len(),
            5,
            "全件取得で5件のメッセージが取得されるべき"
        );

        // 制限付き取得 (limit=3, offset=0)
        let limited_messages = fetch_messages(&pool, 3, 0).await?;
        assert_eq!(
            limited_messages.len(),
            3,
            "制限付き取得で3件のメッセージが取得されるべき"
        );

        // オフセット付き取得 (limit=10, offset=2)
        let offset_messages = fetch_messages(&pool, 10, 2).await?;
        assert_eq!(
            offset_messages.len(),
            3,
            "オフセット付き取得で3件のメッセージが取得されるべき"
        );

        // 範囲外のオフセット (limit=10, offset=10)
        let out_of_range = fetch_messages(&pool, 10, 10).await?;
        assert_eq!(
            out_of_range.len(),
            0,
            "範囲外のオフセットで0件が取得されるべき"
        );

        // 負のlimitとoffsetの処理を確認 (安全な値に変換されるはず)
        let with_negative = fetch_messages(&pool, -1, -5).await?;
        assert!(!with_negative.is_empty(), "負の値が安全に処理されるべき");

        println!("fetch_messagesのテスト完了");
        Ok(())
    }
}
