use once_cell::sync::Lazy;
use regex::Regex;
use std::mem;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use thiserror::Error;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};
use tracing::{error, info, warn};

/// Cloudflaredが出力するURLを検出するための正規表現
static URL_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"https?://[a-z0-9-]+\.trycloudflare\.com").unwrap());

/// タイムアウト時間（秒）
const TUNNEL_START_TIMEOUT_SECS: u64 = 15;

/**
 * トンネル情報を保持する構造体
 *
 * cloudflaredプロセスと生成されたトンネルURLを管理します。
 */
#[derive(Debug, Clone)]
pub struct TunnelInfo {
    /// cloudflaredプロセスへの参照（Option<CommandChild>型）
    /// Option型でラップすることでtake()メソッドを使用可能に
    pub process: Arc<Mutex<Option<CommandChild>>>,

    /// 生成されたCloudflare Tunnelの一時URL
    /// 例: https://xxxx-xxxx-xxxx-xxxx.trycloudflare.com
    pub url: String,
}

/**
 * トンネル処理に関するエラー
 */
#[derive(Error, Debug)]
pub enum TunnelError {
    /// このプラットフォーム用のcloudflaredバイナリ選択に失敗
    #[error("Failed to select cloudflared binary for this platform")]
    BinarySelectionFailed,

    /// プロセスの起動に失敗
    #[error("Failed to spawn cloudflared process: {0}")]
    SpawnFailed(#[from] tauri_plugin_shell::Error),

    /// 標準入出力の操作中にエラー発生
    #[error("Failed to read cloudflared stdout")]
    StdioError,

    /// トンネルURLが見つからなかった
    #[error("Cloudflare URL not found in output within timeout")]
    UrlNotFound,

    /// タイムアウト発生
    #[error("Timed out waiting for cloudflared URL")]
    Timeout,

    /// サポートされていないプラットフォーム
    #[error("Unsupported platform")]
    UnsupportedPlatform,
}

impl TunnelInfo {
    /**
     * 新しいTunnelInfoインスタンスを作成
     *
     * @param {CommandChild} process - cloudflaredプロセス
     * @param {String} url - Cloudflare Tunnelの一時URL
     * @returns {TunnelInfo} 作成されたTunnelInfoインスタンス
     */
    pub fn new(process: CommandChild, url: String) -> Self {
        Self {
            process: Arc::new(Mutex::new(Some(process))),
            url,
        }
    }
}

/**
 * トンネルを起動し、WebSocketサーバーをインターネットに公開する
 *
 * 注意: この実装は次のステップ6.5で完全に書き換えられます。
 * 現在はLoophole用の実装ですが、cloudflared用に更新されます。
 *
 * @param {&AppHandle} app - Tauriアプリハンドル
 * @param {u16} ws_port - WebSocketサーバーのポート番号
 * @returns {Result<TunnelInfo, TunnelError>} 成功時はTunnelInfo、失敗時はエラー
 */
pub async fn start_tunnel(app: &AppHandle, ws_port: u16) -> Result<TunnelInfo, TunnelError> {
    info!("Starting Loophole tunnel for WebSocket port {}", ws_port);

    // 注意: このコードは次のステップでcloudflared用に置き換えられます
    info!("Attempting to start Loophole sidecar with name: loophole");

    // sidecar() メソッドを使用してLoophole CLIプロセスを起動
    let command = app
        .shell()
        .sidecar("loophole") // バイナリ名を指定
        .map_err(TunnelError::SpawnFailed)?;

    let (mut rx, child) = command
        .args(["http", &ws_port.to_string()])
        .spawn()
        .map_err(TunnelError::SpawnFailed)?;

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
 * トンネルを停止する
 *
 * 注意: この実装は次のステップ6.6で完全に書き換えられます。
 * 現在はLoophole用の実装ですが、cloudflared用に更新されます。
 *
 * @param {&TunnelInfo} tunnel_info - 停止するトンネルの情報
 */
pub async fn stop_tunnel(tunnel_info: &TunnelInfo) {
    info!("Stopping Loophole tunnel: {}", tunnel_info.url);

    // Mutex から Option<CommandChild> をムーブアウト
    let child_opt: Option<CommandChild> = {
        let mut guard = match tunnel_info.process.lock() {
            Ok(g) => g,
            Err(e) => {
                error!("Failed to lock tunnel process: {}", e);
                return;
            }
        };
        mem::take(&mut *guard) // guard を空の Some→None に置き換えつつ中身を move
    };

    match child_opt {
        Some(child) => match child.kill() {
            Ok(_) => info!("Loophole process terminated successfully"),
            Err(e) => error!("Failed to kill Loophole process: {}", e),
        },
        None => warn!("Loophole process already stopped or was never started."),
    }
}
