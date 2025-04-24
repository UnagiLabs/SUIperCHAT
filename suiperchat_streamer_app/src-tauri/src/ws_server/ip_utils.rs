use std::{net::IpAddr, str::FromStr};
use tauri::AppHandle;
/**
 * 外部IPアドレス取得ユーティリティ
 *
 * このモジュールは、外部IPアドレスを取得するためのユーティリティ関数を提供します。
 * 環境変数 EXTERNAL_IP_ENDPOINTS に設定された複数のエンドポイントから外部IPアドレスを取得します。
 * エンドポイントはカンマ区切りで指定され、JSONレスポンスが期待されます。
 *
 * # 機能
 * - 複数の外部IP取得サービスをフォールバックとして使用
 * - タイムアウト付きの非同期HTTPリクエスト
 * - エラーハンドリングとログ記録
 */
use tauri_plugin_http::reqwest; // re-exported reqwest
use tracing::{debug, error, info};

/// 外部IPアドレスを取得する
///
/// 環境変数 EXTERNAL_IP_ENDPOINTS に設定されたエンドポイントから外部IPアドレスを取得します。
/// デフォルトでは "https://api.ipify.org?format=json,https://ifconfig.me/all.json" を使用します。
///
/// # 引数
/// * `app` - Tauriアプリケーションハンドル
///
/// # 戻り値
/// * `Result<IpAddr, String>` - 成功した場合は外部IPアドレス、失敗した場合はエラーメッセージ
pub async fn get_external_ip(_app: &AppHandle) -> Result<IpAddr, String> {
    // HTTPクライアントの構築 (タイムアウト5秒)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| {
            let error_msg = format!("HTTPクライアントの構築に失敗しました: {}", e);
            error!("{}", error_msg);
            error_msg
        })?;

    // 環境変数から外部IP取得エンドポイントを取得
    let endpoints = std::env::var("EXTERNAL_IP_ENDPOINTS").unwrap_or_else(|_| {
        "https://api.ipify.org?format=json,https://ifconfig.me/all.json".into()
    });

    debug!("使用する外部IP取得エンドポイント: {}", endpoints);

    // 各エンドポイントに順番にリクエストを送信
    for url in endpoints.split(',') {
        info!("外部IP取得を試行中: {}", url);

        match client.get(url).send().await {
            Ok(response) => {
                // レスポンスをテキストとして取得してJSONに変換
                match response.text().await {
                    Ok(text) => {
                        match serde_json::from_str::<serde_json::Value>(&text) {
                            Ok(json_value) => {
                                // IPアドレスフィールドを探索
                                if let Some(ip_str) = json_value.get("ip").and_then(|v| v.as_str())
                                {
                                    // IPアドレスを解析
                                    match IpAddr::from_str(ip_str) {
                                        Ok(ip) => {
                                            info!("外部IPアドレスの取得に成功: {}", ip);
                                            return Ok(ip);
                                        }
                                        Err(e) => {
                                            error!("IPアドレスの解析に失敗: {} - {}", ip_str, e);
                                            continue;
                                        }
                                    }
                                } else {
                                    error!(
                                        "JSONレスポンスにIPフィールドがありません: {:?}",
                                        json_value
                                    );
                                }
                            }
                            Err(e) => {
                                error!("JSONのパースに失敗: {} - {}", url, e);
                            }
                        }
                    }
                    Err(e) => {
                        error!("レスポンステキストの取得に失敗: {} - {}", url, e);
                    }
                }
            }
            Err(e) => {
                error!("エンドポイントへのリクエストに失敗: {} - {}", url, e);
            }
        }
    }

    // すべてのエンドポイントが失敗した場合
    let error_msg = "すべての外部IP取得エンドポイントが失敗しました".to_string();
    error!("{}", error_msg);
    Err(error_msg)
}
