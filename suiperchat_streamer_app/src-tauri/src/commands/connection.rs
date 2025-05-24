//! 接続管理関連のコマンド
//!
//! クライアント接続の管理・制限を行うコマンドを提供します。

use crate::state::AppState;
use crate::ws_server::ConnectionsInfo;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{command, State};

/// ## 接続情報を取得するコマンド
///
/// 現在の接続状況に関する情報を取得します。
/// タイムアウト処理が組み込まれており、処理が3秒以上かかる場合はエラーを返します。
///
/// ### Arguments
/// - `_app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
///
/// ### Returns
/// - `Result<ConnectionsInfo, String>`: 成功した場合は接続情報、エラーの場合はエラーメッセージ
#[command]
pub fn get_connections_info(_app_state: State<'_, AppState>) -> Result<ConnectionsInfo, String> {
    // 結果を格納するための共有変数
    let result = Arc::new(Mutex::new(None));
    let result_clone = Arc::clone(&result);

    // エラー状態を格納するための共有変数
    let error = Arc::new(Mutex::new(None));
    let error_clone = Arc::clone(&error);

    // 別スレッドで接続情報を取得
    let handle = thread::spawn(move || {
        match std::panic::catch_unwind(|| {
            // グローバル接続マネージャから接続情報を取得
            let connections_info = crate::ws_server::get_connections_info();
            *result_clone.lock().unwrap() = Some(connections_info);
        }) {
            Ok(_) => {}
            Err(e) => {
                let error_msg = if let Some(s) = e.downcast_ref::<String>() {
                    format!("パニック発生: {}", s)
                } else if let Some(s) = e.downcast_ref::<&str>() {
                    format!("パニック発生: {}", s)
                } else {
                    "不明なパニックが発生しました".to_string()
                };
                eprintln!("接続情報取得エラー: {}", error_msg);
                *error_clone.lock().unwrap() = Some(error_msg);
            }
        }
    });

    // タイムアウト付きで待機（3秒）
    let start = Instant::now();
    let timeout = Duration::from_secs(3);

    while start.elapsed() < timeout {
        // 結果をチェック
        if result.lock().unwrap().is_some() {
            // 接続情報が取得できた
            return Ok(result.lock().unwrap().take().unwrap());
        }

        // エラーをチェック
        if let Some(err_msg) = error.lock().unwrap().take() {
            return Err(err_msg);
        }

        // 少し待機して再チェック
        thread::sleep(Duration::from_millis(10));
    }

    // タイムアウトしたらスレッドをデタッチ（バックグラウンドで実行を継続）
    std::mem::forget(handle);

    Err(
        "接続情報の取得がタイムアウトしました。サーバーが応答していない可能性があります。"
            .to_string(),
    )
}

/// ## クライアントを切断するコマンド
///
/// 指定されたIDのクライアント接続を切断します。
///
/// ### Arguments
/// - `_app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
/// - `client_id`: 切断するクライアントのID
///
/// ### Returns
/// - `Result<bool, String>`: 成功した場合は切断結果（成功ならtrue）、エラーの場合はエラーメッセージ
#[command]
pub fn disconnect_client(
    _app_state: State<'_, AppState>,
    client_id: String,
) -> Result<bool, String> {
    // グローバル接続マネージャを使用してクライアントを切断
    let result = crate::ws_server::disconnect_client(&client_id);
    Ok(result)
}

/// ## 最大接続数を設定するコマンド
///
/// WebSocketサーバーの最大同時接続数を設定します。
///
/// ### Arguments
/// - `_app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
/// - `max_connections`: 設定する最大接続数
///
/// ### Returns
/// - `Result<(), String>`: 成功した場合は`Ok(())`、エラーの場合はエラーメッセージ
#[command]
pub fn set_connection_limits(
    _app_state: State<'_, AppState>,
    max_connections: usize,
) -> Result<(), String> {
    if max_connections < 1 {
        return Err("最大接続数は1以上である必要があります".to_string());
    }

    // グローバル接続マネージャを使用して最大接続数を設定
    crate::ws_server::set_max_connections(max_connections);

    Ok(())
}
