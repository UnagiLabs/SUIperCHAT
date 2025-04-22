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
/// * `offset` - 結果セットのオフセット (ページネーション用、0以上)
/// * `app_state` - アプリケーションの状態
///
/// # 戻り値
/// * `Result<Vec<Message>, String>` - 成功時はメッセージのベクター、エラー時はエラーメッセージ
///
/// # エラー
/// - データベース接続が初期化されていない場合
/// - データベース操作中にエラーが発生した場合
/// - ロック関連のエラーが発生した場合
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

    // 無効な入力値のチェック
    if limit <= 0 || limit > 1000 {
        println!("警告: 無効なlimit値({})。有効範囲は1-1000です。", limit);
    }

    if offset < 0 {
        println!("警告: 無効なoffset値({})。0以上の値が必要です。", offset);
    }

    // データベース接続プールを取得
    let db_pool = {
        let pool_guard = app_state.db_pool.lock().map_err(|e| {
            let error_msg = format!("データベース接続プールのロックに失敗しました: {}", e);
            eprintln!("エラー: {}", error_msg);
            error_msg
        })?;

        match &*pool_guard {
            Some(pool) => {
                println!("データベース接続プールを取得しました");
                pool.clone()
            }
            None => {
                let error_msg = "データベース接続が初期化されていません。アプリケーションを再起動してください。".to_string();
                eprintln!("エラー: {}", error_msg);
                return Err(error_msg);
            }
        }
    };

    // データベースからメッセージを取得
    match database::fetch_messages(&db_pool, limit, offset).await {
        Ok(messages) => {
            println!("メッセージ履歴を正常に取得: {}件", messages.len());
            Ok(messages)
        }
        Err(e) => {
            let error_msg = format!(
                "メッセージ履歴の取得中にデータベースエラーが発生しました: {}",
                e
            );
            eprintln!("エラー: {}", error_msg);
            Err(error_msg)
        }
    }
}
