//! 接続管理関連のコマンド
//!
//! クライアント接続の管理・制限を行うコマンドを提供します。

use crate::state::AppState;
use crate::ws_server::ConnectionsInfo;
use tauri::{command, State};

/// ## 接続情報を取得するコマンド
///
/// 現在の接続状況に関する情報を取得します。
///
/// ### Arguments
/// - `_app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
///
/// ### Returns
/// - `Result<ConnectionsInfo, String>`: 成功した場合は接続情報、エラーの場合はエラーメッセージ
#[command]
pub fn get_connections_info(_app_state: State<'_, AppState>) -> Result<ConnectionsInfo, String> {
    println!("接続情報の取得要求");

    // グローバル接続マネージャから接続情報を取得
    let connections_info = crate::ws_server::get_connections_info();
    println!("取得した接続数: {}", connections_info.active_connections);

    Ok(connections_info)
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
    println!("クライアント切断要求: {}", client_id);

    // グローバル接続マネージャを使用してクライアントを切断
    let result = crate::ws_server::disconnect_client(&client_id);
    println!("切断結果: {}", result);

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
    println!("最大接続数設定要求: {}", max_connections);

    if max_connections < 1 {
        return Err("最大接続数は1以上である必要があります".to_string());
    }

    // グローバル接続マネージャを使用して最大接続数を設定
    crate::ws_server::set_max_connections(max_connections);
    println!("最大接続数を{}に設定しました", max_connections);

    Ok(())
}
