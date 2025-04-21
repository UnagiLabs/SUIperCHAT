//! チャット履歴関連のコマンド
//!
//! チャット履歴の取得に関するTauriコマンドを提供します。

use crate::database;
use crate::db_models::{Message, Session};
use crate::state::AppState;
use log::{error, info};
use tauri::{command, State};

/// ## メッセージ履歴を取得するTauriコマンド
///
/// 指定されたセッションのメッセージ履歴を取得します。
/// 結果はタイムスタンプの降順（新しい順）で返されます。
///
/// ### 引数
/// - `session_id`: 取得するセッションのID。指定がない場合は現在のアクティブセッション
/// - `limit`: 取得する最大メッセージ数
/// - `offset`: ページネーション用のオフセット
/// - `app_state`: Tauriの管理するアプリケーション状態
///
/// ### 戻り値
/// - `Result<Vec<Message>, String>`: 成功時はメッセージのベクター、失敗時はエラーメッセージ
#[command(async)]
pub async fn get_message_history(
    session_id: Option<i32>,
    limit: Option<i64>,
    offset: Option<i64>,
    app_state: State<'_, AppState>,
) -> Result<Vec<Message>, String> {
    info!("メッセージ履歴を取得します");

    // データベースプールを取得
    let db_pool = {
        let db_pool_guard = app_state
            .db_pool
            .lock()
            .map_err(|_| "データベースプールのロック取得に失敗しました".to_string())?;

        match &*db_pool_guard {
            Some(pool) => pool.clone(),
            None => return Err("データベース接続がありません".to_string()),
        }
    };

    // セッションIDの決定（指定がなければ現在のアクティブセッション）
    let target_session_id = match session_id {
        Some(id) => id,
        None => {
            // 現在のアクティブセッションIDを取得
            let current_session_id = {
                let session_id_guard = app_state
                    .current_session_id
                    .lock()
                    .map_err(|_| "セッションIDのロック取得に失敗しました".to_string())?;

                // 値をクローンしてMutexGuardを即座に解放
                *session_id_guard
            };

            // MutexGuardがスコープ外になった後に非同期処理
            match current_session_id {
                Some(id) => id,
                None => {
                    // アクティブなセッションがない場合、最新のセッションを検索
                    match database::fetch_active_session(&db_pool).await {
                        Ok(Some(session)) => session.id,
                        Ok(None) => {
                            return Err("現在アクティブなセッションがありません".to_string())
                        }
                        Err(e) => {
                            let error_msg = format!("セッション検索エラー: {}", e);
                            error!("{}", error_msg);
                            return Err(error_msg);
                        }
                    }
                }
            }
        }
    };

    // 制限とオフセットの設定（デフォルト値の適用）
    let limit_value = limit.unwrap_or(50);
    let offset_value = offset.unwrap_or(0);

    // メッセージ履歴の取得
    match database::fetch_messages(&db_pool, target_session_id, limit_value, offset_value).await {
        Ok(messages) => {
            info!("{}件のメッセージを取得しました", messages.len());
            Ok(messages)
        }
        Err(e) => {
            let error_msg = format!("メッセージ取得エラー: {}", e);
            error!("{}", error_msg);
            Err(error_msg)
        }
    }
}

/// ## セッション一覧を取得するTauriコマンド
///
/// 配信セッションの一覧を取得します。
/// 結果は開始時刻の降順（新しい順）で返されます。
///
/// ### 引数
/// - `limit`: 取得する最大セッション数
/// - `offset`: ページネーション用のオフセット
/// - `app_state`: Tauriの管理するアプリケーション状態
///
/// ### 戻り値
/// - `Result<Vec<Session>, String>`: 成功時はセッションのベクター、失敗時はエラーメッセージ
#[command(async)]
pub async fn get_sessions(
    limit: Option<i64>,
    offset: Option<i64>,
    app_state: State<'_, AppState>,
) -> Result<Vec<Session>, String> {
    info!("セッション一覧を取得します");

    // データベースプールを取得
    let db_pool = {
        let db_pool_guard = app_state
            .db_pool
            .lock()
            .map_err(|_| "データベースプールのロック取得に失敗しました".to_string())?;

        match &*db_pool_guard {
            Some(pool) => pool.clone(),
            None => return Err("データベース接続がありません".to_string()),
        }
    };

    // 制限とオフセットの設定（デフォルト値の適用）
    let limit_value = limit.unwrap_or(20);
    let offset_value = offset.unwrap_or(0);

    // セッション一覧の取得
    match database::fetch_sessions(&db_pool, limit_value, offset_value).await {
        Ok(sessions) => {
            info!("{}件のセッションを取得しました", sessions.len());
            Ok(sessions)
        }
        Err(e) => {
            let error_msg = format!("セッション取得エラー: {}", e);
            error!("{}", error_msg);
            Err(error_msg)
        }
    }
}

/// ## 現在のアクティブセッションを取得するTauriコマンド
///
/// 現在アクティブな（終了していない）セッションを取得します。
///
/// ### 引数
/// - `app_state`: Tauriの管理するアプリケーション状態
///
/// ### 戻り値
/// - `Result<Option<Session>, String>`: 成功時はセッションのオプション（なければNone）、失敗時はエラーメッセージ
#[command(async)]
pub async fn get_active_session(app_state: State<'_, AppState>) -> Result<Option<Session>, String> {
    info!("アクティブなセッションを検索します");

    // データベースプールを取得
    let db_pool = {
        let db_pool_guard = app_state
            .db_pool
            .lock()
            .map_err(|_| "データベースプールのロック取得に失敗しました".to_string())?;

        match &*db_pool_guard {
            Some(pool) => pool.clone(),
            None => return Err("データベース接続がありません".to_string()),
        }
    };

    // アクティブセッションの取得
    match database::fetch_active_session(&db_pool).await {
        Ok(session) => {
            match &session {
                Some(s) => info!("アクティブなセッションを発見しました (ID: {})", s.id),
                None => info!("アクティブなセッションは見つかりませんでした"),
            }
            Ok(session)
        }
        Err(e) => {
            let error_msg = format!("アクティブセッション検索エラー: {}", e);
            error!("{}", error_msg);
            Err(error_msg)
        }
    }
}
