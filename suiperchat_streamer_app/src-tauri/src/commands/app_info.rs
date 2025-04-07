/**
 * アプリケーション情報コマンド
 *
 * アプリケーションの基本情報を提供するコマンドを実装します。
 * バージョン番号などフロントエンドから必要な情報を取得できます。
 *
 * @module commands/app_info
 */
use serde::Serialize;

/// アプリバージョン情報レスポンス
#[derive(Serialize)]
pub struct AppVersionResponse {
    /// アプリケーションのバージョン番号
    version: String,
    /// ビルド識別子
    build_id: String,
    /// ビルド日時（ISO 8601形式）
    build_date: String,
}

/// アプリケーションのバージョン情報を取得するコマンド
///
/// # 戻り値
///
/// * `AppVersionResponse` - バージョン情報を含むレスポンス
///
/// # 例
///
/// ```typescript
/// // フロントエンド側の呼び出し例
/// const versionInfo = await invoke('get_app_version');
/// console.log(`アプリバージョン: ${versionInfo.version}`);
/// ```
#[tauri::command]
pub fn get_app_version() -> AppVersionResponse {
    // Cargo.tomlから取得したバージョン
    let version = env!("CARGO_PKG_VERSION").to_string();

    // 実際のアプリではビルド時に環境変数から注入するなど
    // より洗練された方法を使用するとよいでしょう
    let build_id = "dev".to_string();

    // ISO 8601形式の現在時刻
    let now = chrono::Utc::now();
    let build_date = now.to_rfc3339();

    AppVersionResponse {
        version,
        build_id,
        build_date,
    }
}
