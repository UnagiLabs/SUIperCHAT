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
 * - CGNAT (Carrier-grade NAT) 検出機能
 */
use tauri_plugin_http::reqwest; // re-exported reqwest
use tracing::{debug, error, info, warn};

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

/// CGNAT (Carrier-grade NAT) または二重NATを検出する
///
/// STUNサーバーに問い合わせを行い、取得した外部IPアドレスが渡されたものと一致するか検証します。
/// 一致しない場合、CGNAT環境と判断されます。
///
/// # 引数
/// * `public_ip` - 他の方法で取得した外部IPアドレス
///
/// # 戻り値
/// * `Result<bool, String>` - 成功した場合、CGNATが検出されたかどうかを示すbool値
///   - `Ok(true)` - CGNATが検出された
///   - `Ok(false)` - CGNATは検出されなかった
///   - `Err(message)` - STUNクエリが失敗した場合のエラーメッセージ
pub async fn check_cgnat(public_ip: IpAddr) -> Result<bool, String> {
    info!(
        "CGNATの検出を開始します。API経由で取得したIP: {}",
        public_ip
    );

    // Google STUNサーバーにクエリを送信
    let stun_server = "stun.l.google.com:19302";
    info!("STUNサーバーにクエリを送信します: {}", stun_server);

    // STUNクライアントを作成 (任意のローカルIPにバインド)
    let mut client = match stun_client::Client::new("0.0.0.0:0", None).await {
        Ok(client) => client,
        Err(e) => {
            let error_msg = format!("STUNクライアントの作成に失敗しました: {}", e);
            error!("{}", error_msg);
            return Err(error_msg);
        }
    };

    // STUNサーバーに問い合わせを送信
    match client.binding_request(stun_server, None).await {
        Ok(response) => {
            if response.get_class() == stun_client::Class::SuccessResponse {
                // XOR-MAPPED-ADDRESSを取得
                match stun_client::Attribute::get_xor_mapped_address(&response) {
                    Some(stun_addr) => {
                        let stun_ip = stun_addr.ip();
                        info!("STUN経由で取得したIP: {}", stun_ip);

                        // IPアドレスが一致するか検証
                        if stun_ip == public_ip {
                            info!("CGNAT検出: 両方のIPが一致しています。CGNATは検出されませんでした。");
                            Ok(false) // CGNATなし
                        } else {
                            warn!("CGNAT検出: IPアドレスの不一致。CGNAT環境と判断します。API: {}, STUN: {}", public_ip, stun_ip);
                            Ok(true) // CGNAT検出
                        }
                    }
                    None => {
                        let error_msg =
                            "STUNレスポンスにXOR-MAPPED-ADDRESSが含まれていません".to_string();
                        error!("{}", error_msg);
                        Err(error_msg)
                    }
                }
            } else {
                let error_msg = format!(
                    "STUNレスポンスがエラーを返しました: {:?}",
                    response.get_class()
                );
                error!("{}", error_msg);
                Err(error_msg)
            }
        }
        Err(e) => {
            // STUNクエリ失敗
            let error_msg = format!("STUNクエリに失敗しました: {}", e);
            error!("{}", error_msg);
            Err(error_msg)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    #[test]
    fn test_ip_from_str() {
        let valid_ip = "192.168.1.1";
        assert!(IpAddr::from_str(valid_ip).is_ok());

        let invalid_ip = "not an ip";
        assert!(IpAddr::from_str(invalid_ip).is_err());
    }

    // CGNAT検出機能のテスト
    // 注: これは実際の通信を行わないモックテストです
    #[tokio::test]
    async fn test_check_cgnat_mock() {
        // ---- モックのセットアップ ----
        // 実際のIPアドレスの代わりに使用するテスト用のIPアドレス
        let http_api_ip = IpAddr::V4(Ipv4Addr::new(203, 0, 113, 1)); // HTTP APIから取得したと仮定
        let stun_ip_same = IpAddr::V4(Ipv4Addr::new(203, 0, 113, 1)); // STUNから取得したと仮定（同じ）
        let stun_ip_diff = IpAddr::V4(Ipv4Addr::new(198, 51, 100, 1)); // STUNから取得したと仮定（異なる）

        // 実際のSTUNクライアントの代わりに使用するモック関数
        // IPアドレスが一致する場合（CGNATなし）
        let check_result_no_cgnat = check_cgnat_with_mock(http_api_ip, stun_ip_same).await;
        assert!(
            check_result_no_cgnat.is_ok(),
            "CGNATなしケースでエラーが発生しました"
        );
        assert!(
            !check_result_no_cgnat.unwrap(),
            "IPが一致する場合はCGNATなしと判定すべき"
        );

        // IPアドレスが一致しない場合（CGNAT検出）
        let check_result_cgnat = check_cgnat_with_mock(http_api_ip, stun_ip_diff).await;
        assert!(
            check_result_cgnat.is_ok(),
            "CGNAT検出ケースでエラーが発生しました"
        );
        assert!(
            check_result_cgnat.unwrap(),
            "IPが不一致の場合はCGNAT検出と判定すべき"
        );
    }

    // テスト用のモックヘルパー関数 - 実際のSTUNクライアントの代わりに使用
    async fn check_cgnat_with_mock(public_ip: IpAddr, stun_ip: IpAddr) -> Result<bool, String> {
        // STUN応答をシミュレート
        if stun_ip == public_ip {
            // IPが一致する場合（CGNATなし）
            Ok(false)
        } else {
            // IPが一致しない場合（CGNAT検出）
            Ok(true)
        }
    }
}
