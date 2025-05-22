//! YouTube関連のコマンド
//!
//! YouTube動画IDの設定を行うコマンドを提供します。

use crate::state::AppState;
use serde_json::json;
use tauri::{command, Emitter, State};

/// ## YouTube動画IDを設定する Tauri コマンド
///
/// フロントエンドから受け取ったYouTube動画IDを `AppState` に保存します。
/// この設定はアプリ起動ごとにリセットされる一時的な設定です。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
/// - `video_id`: 設定するYouTube動画ID (`String`)
/// - `app_handle`: Tauri アプリケーションハンドル (`tauri::AppHandle`)
///
/// ### Returns
/// - `Result<(), String>`: 成功した場合は `Ok(())`、エラーの場合はエラーメッセージ
#[command]
pub fn set_youtube_video_id(
    app_state: State<'_, AppState>,
    video_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!("Setting YouTube video ID to: {}", video_id);

    let trimmed_video_id = video_id.trim();

    // 動画IDの形式を簡易検証
    if trimmed_video_id.is_empty() {
        return Err("YouTube video ID cannot be empty.".to_string());
    }

    // 文字数の検証（一般的なYouTube動画IDは11文字だが、多少の余裕を持たせる）
    if trimmed_video_id.len() < 10 || trimmed_video_id.len() > 12 {
        return Err(format!(
            "Invalid YouTube video ID length: Expected around 11 characters, got {}.",
            trimmed_video_id.len()
        ));
    }

    // 使用可能な文字のみかチェック（アルファベット、数字、ハイフン、アンダースコア）
    if !trimmed_video_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid YouTube video ID: Contains invalid characters.".to_string());
    }

    // アドレスを AppState に保存
    let mut youtube_id = app_state
        .youtube_video_id
        .lock()
        .map_err(|_| "Failed to lock YouTube video ID mutex".to_string())?;
    *youtube_id = Some(trimmed_video_id.to_string());

    // イベントを発行
    app_handle
        .emit("youtube_video_id_updated", ())
        .map_err(|e| {
            eprintln!("Failed to emit youtube_video_id_updated event: {}", e);
            "Failed to notify frontend about YouTube video ID update".to_string()
        })?;
    println!("YouTube video ID saved and event 'youtube_video_id_updated' emitted.");

    Ok(())
}

/// ## YouTube動画IDを取得する Tauri コマンド
///
/// 現在設定されているYouTube動画IDを返します。
///
/// ### Arguments
/// - `app_state`: Tauri の管理するアプリケーション状態 (`State<AppState>`)
///
/// ### Returns
/// - `Result<serde_json::Value, String>`: 成功した場合はYouTube動画IDを含むJSON、エラーの場合はエラーメッセージ
#[command]
pub fn get_youtube_video_id(app_state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    println!("Getting YouTube video ID...");

    // YouTube動画IDを取得
    let youtube_id_guard = app_state
        .youtube_video_id
        .lock()
        .map_err(|_| "Failed to lock YouTube video ID mutex".to_string())?;

    // JSONオブジェクトを作成
    // youtube_video_idが存在する場合はそれを、存在しない場合はnullを返す
    let json_result = if let Some(id) = youtube_id_guard.as_ref() {
        json!({ "youtube_video_id": id })
    } else {
        json!({ "youtube_video_id": null })
    };

    Ok(json_result)
}
