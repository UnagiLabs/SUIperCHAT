//! ウォレット関連のコマンド
//!
//! ウォレットアドレスの設定・取得を行うコマンドを提供します。

use crate::state::AppState;
use serde::Serialize;
use tauri::{command, Emitter, State};

/// ## フロントエンドに渡す配信者情報
///
/// WebSocketの接続URLと配信者のウォレットアドレスを含みます。
#[derive(Serialize, Clone)]
pub struct StreamerInfo {
    /// WebSocketサーバーの完全なURL (例: "ws://127.0.0.1:8080")
    ws_url: String,
    /// OBSサーバーの完全なURL (例: "http://127.0.0.1:8081/obs/")
    obs_url: String,
    /// 配信者のSUIウォレットアドレス
    wallet_address: String,
    /// YouTube動画ID (設定されている場合)
    youtube_video_id: Option<String>,
}

/// ## ウォレットアドレスを設定する Tauri コマンド
///
/// フロントエンドから受け取ったウォレットアドレスを `AppState` に保存します。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
/// - `address`: 設定するウォレットアドレス (`String`)
/// - `app_handle`: Tauri アプリケーションハンドル (`tauri::AppHandle`)
///
/// ### Returns
/// - `Result<(), String>`: 成功した場合は `Ok(())`、エラーの場合はエラーメッセージ
#[command]
pub fn set_wallet_address(
    app_state: State<'_, AppState>,
    address: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!("Setting wallet address to: {}", address);

    let trimmed_address = address.trim();

    // --- SUIウォレットアドレス形式のバリデーション ---
    if !trimmed_address.starts_with("0x") {
        return Err("Invalid SUI wallet address: Must start with '0x'.".to_string());
    }
    if trimmed_address.len() != 66 {
        // "0x" + 64 hex characters
        return Err(format!(
            "Invalid SUI wallet address: Expected length 66, got {}.",
            trimmed_address.len()
        ));
    }
    if !trimmed_address[2..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(
            "Invalid SUI wallet address: Contains non-hexadecimal characters after '0x'."
                .to_string(),
        );
    }
    // --- バリデーションここまで ---

    // --- アドレスを AppState に保存 ---
    let mut wallet_addr = app_state
        .wallet_address
        .lock()
        .map_err(|_| "Failed to lock wallet address mutex".to_string())?;
    *wallet_addr = Some(trimmed_address.to_string());

    // --- イベントを発行 ---
    app_handle.emit("wallet_address_updated", ()).map_err(|e| {
        eprintln!("Failed to emit wallet_address_updated event: {}", e);
        "Failed to notify frontend about wallet address update".to_string()
    })?;
    println!("Wallet address saved and event 'wallet_address_updated' emitted.");

    Ok(())
}

/// ## 単純にウォレットアドレスを取得する Tauri コマンド
///
/// 現在設定されているウォレットアドレスのみを返します。
/// サーバーの状態に依存しないため、サーバー起動前にウォレットアドレスの
/// 確認を行う場合に使用します。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
///
/// ### Returns
/// - `Result<{ wallet_address: Option<String> }, String>`: 成功した場合はウォレットアドレスを含むオブジェクト
#[command]
pub fn get_wallet_address(app_state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    println!("Getting wallet address...");

    // ウォレットアドレスを取得
    let wallet_addr_guard = app_state
        .wallet_address
        .lock()
        .map_err(|_| "Failed to lock wallet address mutex".to_string())?;

    // JSONオブジェクトを作成
    // wallet_addressが存在する場合はそれを、存在しない場合はnullを返す
    let json_result = if let Some(addr) = wallet_addr_guard.as_ref() {
        serde_json::json!({ "wallet_address": addr })
    } else {
        serde_json::json!({ "wallet_address": null })
    };

    Ok(json_result)
}

/// ## 配信者情報を取得する Tauri コマンド
///
/// 現在設定されている配信者のウォレットアドレスと、
/// 稼働中の（またはデフォルトの）WebSocketサーバーURLとOBSサーバーURLを取得して返します。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
///
/// ### Returns
/// - `Result<StreamerInfo, String>`: 成功した場合は `StreamerInfo`、失敗した場合はエラーメッセージ
#[command]
pub fn get_streamer_info(app_state: State<'_, AppState>) -> Result<StreamerInfo, String> {
    println!("Getting streamer info...");

    // --- ウォレットアドレスを取得 ---
    let wallet_addr_guard = app_state
        .wallet_address
        .lock()
        .map_err(|_| "Failed to lock wallet address mutex".to_string())?;
    let wallet_address = wallet_addr_guard
        .as_ref()
        .ok_or_else(|| "Wallet address is not set. Please configure it first.".to_string())?
        .clone();

    // --- YouTube動画IDを取得 ---
    let youtube_id_guard = app_state
        .youtube_video_id
        .lock()
        .map_err(|_| "Failed to lock YouTube video ID mutex".to_string())?;
    let youtube_video_id = youtube_id_guard.clone();

    // --- WebSocket URLをAppStateから構築 ---
    let host_guard = app_state
        .host
        .lock()
        .map_err(|_| "Failed to lock host mutex".to_string())?;
    let host = host_guard.as_ref().ok_or_else(|| {
        "WebSocket server host is not available (server not running?).".to_string()
    })?;

    let port_guard = app_state
        .port
        .lock()
        .map_err(|_| "Failed to lock port mutex".to_string())?;
    let port = port_guard.ok_or_else(|| {
        "WebSocket server port is not available (server not running?).".to_string()
    })?;

    // --- OBS URLをAppStateから構築 ---
    let obs_port_guard = app_state
        .obs_port
        .lock()
        .map_err(|_| "Failed to lock obs_port mutex".to_string())?;
    let obs_port = obs_port_guard
        .ok_or_else(|| "OBS server port is not available (server not running?).".to_string())?;

    // WebSocket URL を構築
    let ws_url = format!("ws://{}:{}/ws", host, port);
    println!("Constructed ws_url from AppState: {}", ws_url);

    // OBS URL を構築
    let obs_url = format!("http://{}:{}/obs/", host, obs_port);
    println!("Constructed obs_url from AppState: {}", obs_url);

    Ok(StreamerInfo {
        ws_url,
        obs_url,
        wallet_address,
        youtube_video_id,
    })
}
