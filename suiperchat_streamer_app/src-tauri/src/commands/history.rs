//! 履歴関連のコマンドモジュール
//!
//! チャットメッセージとスーパーチャットの履歴を取得するためのTauriコマンドを提供する

use crate::database;
use crate::state::AppState;
use crate::types::SerializableMessageForStreamer;
use serde::{Deserialize, Serialize};
use tauri::State;

/// メッセージ履歴取得のパラメータ構造体
#[derive(Deserialize, Debug)]
pub struct GetMessageHistoryParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub session_id: Option<String>,
    pub sort_asc: Option<bool>,
}

/// メッセージ履歴を取得するTauriコマンド
///
/// 指定された制限とオフセットに基づいて、データベースからメッセージ履歴を取得します。
/// セッションIDが指定された場合はそのセッションのメッセージのみを取得します。
///
/// # 引数
/// * `limit` - 取得するメッセージの最大数 (デフォルト100)
/// * `offset` - 結果セットのオフセット (ページネーション用、0以上)
/// * `session_id` - 取得対象のセッションID（指定しない場合は全セッション）
/// * `sort_asc` - ソート順（true: 昇順、false: 降順、デフォルトtrue）
/// * `app_state` - アプリケーションの状態
///
/// # 戻り値
/// * `Result<Vec<SerializableMessageForStreamer>, String>` - 成功時はメッセージのベクター、エラー時はエラーメッセージ
///
/// # エラー
/// - データベース接続が初期化されていない場合
/// - データベース操作中にエラーが発生した場合
/// - ロック関連のエラーが発生した場合
#[tauri::command]
pub async fn get_message_history(
    params: GetMessageHistoryParams,
    app_state: State<'_, AppState>,
) -> Result<Vec<SerializableMessageForStreamer>, String> {
    // 入力値の調整
    let limit_value = params.limit.unwrap_or(100);
    let offset_value = params.offset.unwrap_or(0);
    let sort_asc_value = params.sort_asc.unwrap_or(true);

    // パラメータログ
    if params.session_id.is_some() {
        println!(
            "メッセージ履歴取得: session_id={:?}, limit={}",
            params.session_id, limit_value
        );
    } else {
        println!("メッセージ履歴取得: session_id=None");
    }

    // データベース接続プールを取得
    let db_pool = {
        let pool_guard = app_state.db_pool.lock().map_err(|e| {
            let error_msg = format!("データベース接続プールのロックに失敗しました: {}", e);
            eprintln!("エラー: {}", error_msg);
            error_msg
        })?;

        match &*pool_guard {
            Some(pool) => pool.clone(),
            None => {
                let error_msg = "データベース接続が初期化されていません。アプリケーションを再起動してください。".to_string();
                eprintln!("エラー: {}", error_msg);
                return Err(error_msg);
            }
        }
    };

    // データベースからメッセージを取得
    let messages = match params.session_id {
        Some(sid) => {
            // セッションIDが指定されている場合、そのセッションのメッセージのみを取得
            database::get_messages_by_session_id_with_options(
                &db_pool,
                &sid,
                limit_value,
                Some(offset_value),
                sort_asc_value,
            )
            .await
            .map_err(|e| {
                let error_msg = format!(
                    "セッション別メッセージ取得中にデータベースエラーが発生しました: {}",
                    e
                );
                eprintln!("エラー: {}", error_msg);
                error_msg
            })?
        }
        None => {
            // セッションIDが指定されていない場合、全メッセージを取得
            database::fetch_messages(&db_pool, limit_value, offset_value)
                .await
                .map_err(|e| {
                    let error_msg = format!(
                        "メッセージ履歴の取得中にデータベースエラーが発生しました: {}",
                        e
                    );
                    eprintln!("エラー: {}", error_msg);
                    error_msg
                })?
        }
    };

    // Message型からSerializableMessageForStreamer型に変換
    let serializable_messages: Vec<SerializableMessageForStreamer> = messages
        .into_iter()
        .map(SerializableMessageForStreamer::from)
        .collect();

    Ok(serializable_messages)
}

/// 現在アクティブなセッションIDを取得するTauriコマンド
///
/// @return 現在のセッションID、またはサーバーが起動していない場合はNull
#[tauri::command]
pub async fn get_current_session_id(
    app_state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let lock = app_state
        .current_session_id
        .lock()
        .map_err(|e| e.to_string())?;
    let result = lock.clone();
    println!("get_current_session_id の戻り値: {:?}", result);
    Ok(result)
}

/// セッション情報を表すシリアライズ可能な構造体
///
/// フロントエンドに送信するためのセッション情報を格納します。
#[derive(Serialize, Debug, Clone)]
pub struct SessionInfo {
    /// セッションID
    pub id: String,
    /// セッション開始日時（ISO 8601形式の文字列）
    pub started_at: String,
    /// セッション終了日時（ISO 8601形式の文字列、終了していない場合はNone）
    pub ended_at: Option<String>,
}

/// 全てのユニークなセッションIDを取得するTauriコマンド
///
/// @return 過去のセッションIDのリスト
#[tauri::command]
pub async fn get_all_session_ids(app_state: State<'_, AppState>) -> Result<Vec<String>, String> {
    // データベース接続プールを取得
    let db_pool = {
        let pool_guard = app_state
            .db_pool
            .lock()
            .map_err(|e| format!("データベース接続プールのロックに失敗しました: {}", e))?;

        match &*pool_guard {
            Some(pool) => pool.clone(),
            None => {
                return Err("データベース接続が初期化されていません。アプリケーションを再起動してください。".to_string());
            }
        }
    };

    // データベースから全セッションIDを取得
    database::get_distinct_session_ids(&db_pool)
        .await
        .map_err(|e| {
            format!(
                "セッションID取得中にデータベースエラーが発生しました: {}",
                e
            )
        })
}

/// 全てのセッション情報（ID、開始日時、終了日時）を取得するTauriコマンド
///
/// セッション一覧を日時と共に表示するために使用されます。
/// 結果は開始日時の降順（新しいものから古いものへ）でソートされます。
///
/// # 戻り値
/// * `Result<Vec<SessionInfo>, String>` - 成功時はセッション情報のベクター、エラー時はエラーメッセージ
///
/// # エラー
/// - データベース接続が初期化されていない場合
/// - データベース操作中にエラーが発生した場合
/// - ロック関連のエラーが発生した場合
#[tauri::command]
pub async fn get_all_sessions_info(
    app_state: State<'_, AppState>,
) -> Result<Vec<SessionInfo>, String> {
    println!("セッション情報一覧取得を開始します");

    // データベース接続プールを取得
    let db_pool = {
        let pool_guard = app_state.db_pool.lock().map_err(|e| {
            let error_msg = format!("データベース接続プールのロックに失敗しました: {}", e);
            eprintln!("エラー: {}", error_msg);
            error_msg
        })?;

        match &*pool_guard {
            Some(pool) => pool.clone(),
            None => {
                let error_msg = "データベース接続が初期化されていません。アプリケーションを再起動してください。".to_string();
                eprintln!("エラー: {}", error_msg);
                return Err(error_msg);
            }
        }
    };

    // データベースから全セッション情報を取得
    match database::get_all_sessions(&db_pool).await {
        Ok(sessions) => {
            println!("取得されたセッション数: {}", sessions.len());

            // Session型からSessionInfo型に変換
            let session_infos: Vec<SessionInfo> = sessions
                .into_iter()
                .map(|session| SessionInfo {
                    id: session.id,
                    started_at: session.started_at,
                    ended_at: session.ended_at,
                })
                .collect();

            Ok(session_infos)
        }
        Err(e) => {
            let error_msg = format!(
                "セッション情報取得中にデータベースエラーが発生しました: {}",
                e
            );
            eprintln!("エラー: {}", error_msg);
            Err(error_msg)
        }
    }
}
