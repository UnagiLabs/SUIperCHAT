/**
 * グリーティングコマンド
 *
 * 基本的なIPC通信テスト用のグリーティングコマンドを提供します。
 * フロントエンドから名前を受け取り、挨拶メッセージを返します。
 *
 * @module commands/greeting
 */
use serde::{Deserialize, Serialize};

/// グリーティングレスポンス
#[derive(Serialize)]
pub struct GreetingResponse {
    /// 生成された挨拶メッセージ
    message: String,
    /// 挨拶が生成された時刻（Unix時間）
    timestamp: u64,
}

/// グリーティングリクエスト
#[derive(Deserialize)]
pub struct GreetingRequest {
    /// 挨拶する相手の名前
    name: String,
}

/// フロントエンドから呼び出し可能なグリーティングコマンド
///
/// # 引数
///
/// * `request` - 名前を含むリクエストオブジェクト
///
/// # 戻り値
///
/// * `GreetingResponse` - 挨拶メッセージと時刻を含むレスポンス
///
/// # 例
///
/// ```typescript
/// // フロントエンド側の呼び出し例
/// const response = await invoke('greet', { name: 'ユーザー名' });
/// console.log(response.message); // "こんにちは、ユーザー名さん！"
/// ```
#[tauri::command]
pub fn greet(request: GreetingRequest) -> GreetingResponse {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    GreetingResponse {
        message: format!("こんにちは、{}さん！", request.name),
        timestamp: now,
    }
}
