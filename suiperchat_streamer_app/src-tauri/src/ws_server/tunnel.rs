use once_cell::sync::Lazy;
use regex::Regex;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use thiserror::Error;
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

/// トンネルを起動し、WebSocketサーバーをインターネットに公開する
///
/// Cloudflare Quick Tunnelを使用して、ローカルで実行されているWebSocketサーバーを
/// インターネットに安全に公開します。cloudflaredプロセスをサイドカーとして実行し、
/// 生成された一時的なURL（https://*.trycloudflare.com）を取得します。
///
/// # Arguments
/// * `app` - Tauriアプリハンドル
/// * `ws_port` - WebSocketサーバーのポート番号
///
/// # Returns
/// * `Result<TunnelInfo, TunnelError>` - 成功時はTunnelInfo、失敗時はエラー
pub async fn start_tunnel(app: &AppHandle, ws_port: u16) -> Result<TunnelInfo, TunnelError> {
    info!("Starting Cloudflare Tunnel for WebSocket port {}", ws_port);

    // cloudflaredコマンドの引数を構築
    let mut args = vec![
        "tunnel".to_string(),
        "--url".to_string(),
        format!("http://127.0.0.1:{}", ws_port),
        "--no-autoupdate".to_string(),
    ];

    // 環境変数から追加引数を取得して追加
    if let Ok(extra_args_str) = std::env::var("CLOUDFLARED_EXTRA_ARGS") {
        if !extra_args_str.is_empty() {
            args.extend(extra_args_str.split_whitespace().map(String::from));
        }
    }

    // 環境変数からログレベルを取得して追加（存在する場合）
    if let Ok(log_level) = std::env::var("CLOUDFLARED_LOG_LEVEL") {
        if !log_level.is_empty() {
            args.push("--loglevel".to_string());
            args.push(log_level);
        }
    }

    info!(
        "Attempting to start cloudflared with args: {:?}",
        args.join(" ")
    );

    // Tauriのsidecar機能を使用してcloudflaredプロセスを起動
    // sidecar()にはベース名のみを渡す（Tauriがプラットフォームに応じたバイナリを選択）
    let (mut rx, child) = app
        .shell()
        .sidecar("cloudflared")
        .map_err(TunnelError::SpawnFailed)?
        .args(&args)
        .spawn()?;

    // プロセスのためのArc<Mutex<Option<CommandChild>>>を作成
    let child_arc = Arc::new(Mutex::new(Some(child)));

    // URL抽出ロジック（タイムアウト付き）
    let url_extraction = async {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    info!("cloudflared stdout: {}", line_str);

                    // 標準出力からTunnelのURLを検索
                    if let Some(mat) = URL_REGEX.find(&line_str) {
                        let url = mat.as_str().to_string();
                        info!("Cloudflare Tunnel URL found: {}", url);
                        return Ok(url); // URLが見つかったら返す
                    }
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    warn!("cloudflared stderr: {}", line_str);

                    // 標準エラー出力からもURLを検索（エラーメッセージにURLが含まれる場合がある）
                    if let Some(mat) = URL_REGEX.find(&line_str) {
                        let url = mat.as_str().to_string();
                        info!("Cloudflare Tunnel URL found in stderr: {}", url);
                        return Ok(url);
                    }
                }
                CommandEvent::Error(err) => {
                    error!("cloudflared process error: {}", err);
                    return Err(TunnelError::StdioError);
                }
                CommandEvent::Terminated(status) => {
                    if let Some(code) = status.code {
                        warn!(
                            "cloudflared process terminated unexpectedly with code: {}",
                            code
                        );
                    } else {
                        warn!("cloudflared process terminated unexpectedly without exit code");
                    }
                    return Err(TunnelError::UrlNotFound);
                }
                _ => {} // 他のイベント（Runningなど）は無視
            }
        }

        // ループを抜けた場合はURLが見つからなかった
        Err(TunnelError::UrlNotFound)
    };

    // タイムアウト付きでURL抽出処理を実行
    match timeout(
        Duration::from_secs(TUNNEL_START_TIMEOUT_SECS),
        url_extraction,
    )
    .await
    {
        Ok(Ok(url)) => {
            // 成功: URLとプロセスハンドルを含むTunnelInfoを返す
            info!("Cloudflare tunnel established with URL: {}", url);
            Ok(TunnelInfo {
                process: child_arc,
                url,
            })
        }
        Ok(Err(e)) => {
            // URL抽出中のエラー: プロセスは起動しているので終了処理
            error!("Error while extracting URL: {}", e);
            let mut child_guard = child_arc.lock().unwrap();
            if let Some(child_to_kill) = child_guard.take() {
                if let Err(kill_err) = child_to_kill.kill() {
                    error!(
                        "Failed to kill cloudflared process after URL extraction error: {}",
                        kill_err
                    );
                } else {
                    info!("Killed cloudflared process after URL extraction error");
                }
            }
            Err(e)
        }
        Err(_) => {
            // タイムアウト: プロセスは起動しているので終了処理
            error!(
                "Timed out waiting for cloudflared URL (timeout: {}s)",
                TUNNEL_START_TIMEOUT_SECS
            );
            let mut child_guard = child_arc.lock().unwrap();
            if let Some(child_to_kill) = child_guard.take() {
                if let Err(kill_err) = child_to_kill.kill() {
                    error!("Failed to kill timed out cloudflared process: {}", kill_err);
                } else {
                    info!("Killed cloudflared process due to timeout");
                }
            }
            Err(TunnelError::Timeout)
        }
    }
}

/**
 * トンネルを停止する
 *
 * 作成されたCloudflare Quick Tunnelを停止します。
 * TunnelInfo内のプロセスハンドルを使用してcloudflaredプロセスを終了させます。
 *
 * # Arguments
 * * `tunnel_info` - 停止するトンネルの情報
 */
pub async fn stop_tunnel(tunnel_info: &TunnelInfo) {
    // Mutexからプロセスのオプションを取り出す
    let maybe_child = tunnel_info.process.lock().unwrap().take();

    if let Some(child) = maybe_child {
        info!(
            "Stopping cloudflared tunnel process for URL: {}",
            tunnel_info.url
        );
        match child.kill() {
            Ok(_) => info!("Cloudflared tunnel process stopped successfully."),
            Err(e) => error!("Failed to stop cloudflared tunnel process: {}", e),
        }
    } else {
        info!("Tunnel process already taken or stopped.");
    }
}
