use once_cell::sync::Lazy;
use regex::Regex;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use thiserror::Error;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};
use tracing::{error, info, warn};

/// Loopholeが出力するURLを検出するための正規表現
static URL_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"https://[a-zA-Z0-9-]+\.loophole\.cloud").unwrap());

/// タイムアウト時間（秒）
const TUNNEL_START_TIMEOUT_SECS: u64 = 30;

/**
 * トンネル情報を保持する構造体
 *
 * @property {Arc<Mutex<CommandChild>>} process - LoopholeのCLIプロセスへの参照 (CommandChild型)
 * @property {String} url - 生成されたHTTPSトンネルURL
 */
#[derive(Clone)]
pub struct TunnelInfo {
    /// LoopholeのCLIプロセスへの参照 (CommandChild型)
    pub process: Arc<Mutex<CommandChild>>,

    /// 生成されたHTTPSトンネルURL
    pub url: String,
}

/**
 * トンネル処理に関するエラー
 */
#[derive(Error, Debug)]
pub enum TunnelError {
    /// プロセスの起動に失敗
    #[error("Failed to spawn Loophole process: {0}")]
    SpawnFailed(String),

    /// 標準入出力の操作中にエラー発生
    #[error("Stdio error: {0}")]
    StdioError(String),

    /// トンネルURLが見つからなかった
    #[error("Tunnel URL not found in output")]
    UrlNotFound,

    /// タイムアウト発生
    #[error("Timeout waiting for tunnel URL")]
    Timeout,

    /// サポートされていないプラットフォーム
    #[error("Unsupported platform")]
    UnsupportedPlatform,

    /// その他のエラー
    #[error("Other error: {0}")]
    Other(String),
}

impl TunnelInfo {
    /**
     * 新しいTunnelInfoインスタンスを作成
     *
     * @param {CommandChild} process - Loopholeプロセス (CommandChild型)
     * @param {String} url - トンネルURL
     * @returns {TunnelInfo} 作成されたTunnelInfoインスタンス
     */
    pub fn new(process: CommandChild, url: String) -> Self {
        Self {
            process: Arc::new(Mutex::new(process)),
            url,
        }
    }
}

/**
 * Loopholeトンネルを起動し、WebSocketサーバーをインターネットに公開する
 *
 * この関数はLoophole CLIをサイドカーとして起動し、指定されたWebSocketポートを
 * インターネットに公開するトンネルを確立します。成功時は生成されたHTTPSのURLを含む
 * TunnelInfoを返します。
 *
 * @param {&AppHandle} app - Tauriアプリハンドル
 * @param {u16} ws_port - WebSocketサーバーのポート番号
 * @returns {Result<TunnelInfo, TunnelError>} 成功時はTunnelInfo、失敗時はエラー
 */
pub async fn start_tunnel(app: &AppHandle, ws_port: u16) -> Result<TunnelInfo, TunnelError> {
    info!("Starting Loophole tunnel for WebSocket port {}", ws_port);

    // Tauriがtauri.conf.jsonのexternalBinとcapabilities/shell.jsonの設定に基づいて
    // 適切なバイナリを自動的に選択するため、プラットフォーム分岐は不要。
    // sidecar()にはバイナリ名（パス区切りなし）を渡す。
    info!("Attempting to start Loophole sidecar with name: loophole");

    // sidecar() メソッドを使用してLoophole CLIプロセスを起動
    let command = app
        .shell()
        .sidecar("loophole") // バイナリ名を指定
        .map_err(|e| TunnelError::SpawnFailed(e.to_string()))?;

    let (mut rx, child) = command
        .args(["http", &ws_port.to_string()])
        .spawn()
        .map_err(|e| TunnelError::SpawnFailed(e.to_string()))?;

    info!("Loophole process spawned, waiting for URL...");

    // URLを受け取るためのチャネルを作成
    let (url_tx, mut url_rx) = mpsc::channel::<String>(1);

    // 非同期タスクでLoopholeプロセスの標準出力を監視
    let _monitor_task = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    info!("Loophole stdout: {}", line_str);

                    if let Some(captures) = URL_REGEX.find(&line_str) {
                        let url = captures.as_str().to_string();
                        info!("Found Loophole URL: {}", url);

                        if url_tx.send(url).await.is_err() {
                            error!("Failed to send URL through channel");
                            break;
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    warn!("Loophole stderr: {}", line_str);
                }
                CommandEvent::Error(err) => {
                    error!("Loophole process error: {}", err);
                    break;
                }
                CommandEvent::Terminated(status) => {
                    if let Some(code) = status.code {
                        warn!("Loophole process terminated with code: {}", code);
                    } else {
                        warn!("Loophole process terminated without exit code");
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    // タイムアウト付きでURLを待機
    let url = match timeout(
        Duration::from_secs(TUNNEL_START_TIMEOUT_SECS),
        url_rx.recv(),
    )
    .await
    {
        Ok(Some(url)) => url,
        Ok(None) => {
            error!("URL channel closed without receiving URL");
            return Err(TunnelError::UrlNotFound);
        }
        Err(_) => {
            error!("Timeout waiting for Loophole URL");
            return Err(TunnelError::Timeout);
        }
    };

    // 監視タスクは実行を続行（バックグラウンドでURLや終了などのイベントを監視）

    // 成功: TunnelInfo を返す
    info!("Loophole tunnel established with URL: {}", url);
    Ok(TunnelInfo::new(child, url))
}

/**
 * Loopholeトンネルを停止する
 *
 * @param {&TunnelInfo} tunnel_info - 停止するトンネル情報
 */
pub async fn stop_tunnel(tunnel_info: &TunnelInfo) {
    info!("Stopping Loophole tunnel: {}", tunnel_info.url);

    // 注: CommandChild の kill() メソッドを直接使用することはできないため、
    // 代わりにプロセスが自動的に終了するようにする方法を採用

    info!("Tunnel process will be released and allowed to close");

    // AppStateからLoopholeInfoを削除する必要がある場合、
    // その処理は呼び出し元（server_manager.rs）で既に行われていて、
    // AppState.loophole_info の中身は None に設定されている
    // トンネルプロセスはTauri AppHandleが閉じられた時に自動的に終了する
}
