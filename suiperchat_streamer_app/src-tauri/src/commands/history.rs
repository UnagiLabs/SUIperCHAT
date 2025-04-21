//! 履歴関連のコマンドモジュール
//!
//! チャットメッセージとスーパーチャットの履歴を取得するためのTauriコマンドを提供する

use crate::database;
use crate::db_models::Message;
use crate::state::AppState;
use tauri::State;

/// メッセージ履歴を取得するTauriコマンド
///
/// 指定された制限とオフセットに基づいて、データベースからメッセージ履歴を取得します。
///
/// # 引数
/// * `limit` - 取得するメッセージの最大数 (1-1000)
/// * `offset` - 結果セットのオフセット (ページネーション用)
/// * `app_state` - アプリケーションの状態
///
/// # 戻り値
/// * `Result<Vec<Message>, String>` - 成功時はメッセージのベクター、エラー時はエラーメッセージ
///
/// # エラー
/// - データベース接続が初期化されていない場合
/// - データベース操作中にエラーが発生した場合
#[tauri::command]
pub async fn get_message_history(
    limit: i64,
    offset: i64,
    app_state: State<'_, AppState>,
) -> Result<Vec<Message>, String> {
    println!(
        "メッセージ履歴取得コマンドを実行: limit={}, offset={}",
        limit, offset
    );

    // データベース接続プールを取得
    let db_pool = {
        let pool_guard = app_state
            .db_pool
            .lock()
            .map_err(|e| format!("データベース接続プールのロックに失敗しました: {}", e))?;

        match &*pool_guard {
            Some(pool) => pool.clone(),
            None => return Err("データベース接続が初期化されていません".to_string()),
        }
    };

    // データベースからメッセージを取得
    let messages = database::fetch_messages(&db_pool, limit, offset)
        .await
        .map_err(|e| format!("メッセージ履歴の取得中にエラーが発生しました: {}", e))?;

    println!("メッセージ履歴を正常に取得: {}件", messages.len());

    Ok(messages)
}
