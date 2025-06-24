use once_cell::sync::Lazy;
use regex::Regex;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::process::Stdio;
use tauri::AppHandle;
use thiserror::Error;
use tokio::time::{timeout, Duration, sleep, interval};
use tokio::process::{Child, Command as TokioCommand};
use tokio::io::{AsyncBufReadExt, BufReader};
use tracing::{error, info, warn, debug};
use crate::cloudflared_manager::{CloudflaredManager, CloudflaredManagerError};

/// Cloudflaredが出力するURLを検出するための正規表現
static URL_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"https?://[a-z0-9-]+\.trycloudflare\.com").unwrap());

/// タイムアウト時間（秒）
const TUNNEL_START_TIMEOUT_SECS: u64 = 30;
/// 健全性チェックの間隔（秒）
const HEALTH_CHECK_INTERVAL_SECS: u64 = 5;
/// 最大再起動試行回数
const MAX_RESTART_ATTEMPTS: u32 = 3;
/// 再起動待機時間（秒）
const RESTART_DELAY_SECS: u64 = 2;

/**
 * トンネル情報を保持する構造体
 *
 * cloudflaredプロセスと生成されたトンネルURLを管理します。
 */
#[derive(Debug, Clone)]
pub struct TunnelInfo {
    /// cloudflaredプロセスへの参照（Option<Child>型）
    /// Option型でラップすることでtake()メソッドを使用可能に
    pub process: Arc<Mutex<Option<Child>>>,

    /// 生成されたCloudflare Tunnelの一時URL
    /// 例: https://xxxx-xxxx-xxxx-xxxx.trycloudflare.com
    pub url: String,

    /// プロセス監視の停止フラグ
    pub should_stop: Arc<AtomicBool>,

    /// プロセス管理情報
    pub process_manager: Arc<Mutex<ProcessManager>>,
}

/**
 * プロセス管理情報を保持する構造体
 */
#[derive(Debug)]
pub struct ProcessManager {
    /// アプリハンドル
    pub app_handle: AppHandle,
    /// WebSocketポート
    pub ws_port: u16,
    /// 再起動試行回数
    pub restart_attempts: u32,
    /// プロセスが実行中かどうか
    pub is_running: bool,
}

/**
 * トンネル処理に関するエラー
 */
#[derive(Error, Debug)]
pub enum TunnelError {
    /// Cloudflaredマネージャーのエラー
    #[error("Cloudflared manager error: {0}")]
    ManagerError(#[from] CloudflaredManagerError),

    /// プロセスの起動に失敗
    #[error("Failed to spawn cloudflared process: {0}")]
    SpawnFailed(#[from] std::io::Error),

    /// 標準入出力の操作中にエラー発生
    #[error("Failed to read cloudflared stdout")]
    StdioError,

    /// トンネルURLが見つからなかった
    #[error("Cloudflare URL not found in output within timeout")]
    UrlNotFound,

    /// タイムアウト発生
    #[error("Timed out waiting for cloudflared URL")]
    Timeout,
}

impl ProcessManager {
    pub fn new(app_handle: AppHandle, ws_port: u16) -> Self {
        Self {
            app_handle,
            ws_port,
            restart_attempts: 0,
            is_running: false,
        }
    }

    pub fn reset_restart_attempts(&mut self) {
        self.restart_attempts = 0;
    }

    pub fn increment_restart_attempts(&mut self) {
        self.restart_attempts += 1;
    }

    pub fn can_restart(&self) -> bool {
        self.restart_attempts < MAX_RESTART_ATTEMPTS
    }

    pub fn set_running(&mut self, running: bool) {
        self.is_running = running;
    }
}

impl TunnelInfo {
    /**
     * 新しいTunnelInfoインスタンスを作成
     *
     * @param {Child} process - cloudflaredプロセス
     * @param {String} url - Cloudflare Tunnelの一時URL
     * @param {AppHandle} app_handle - Tauriアプリハンドル
     * @param {u16} ws_port - WebSocketポート
     * @returns {TunnelInfo} 作成されたTunnelInfoインスタンス
     */
    pub fn new(process: Child, url: String, app_handle: AppHandle, ws_port: u16) -> Self {
        Self {
            process: Arc::new(Mutex::new(Some(process))),
            url,
            should_stop: Arc::new(AtomicBool::new(false)),
            process_manager: Arc::new(Mutex::new(ProcessManager::new(app_handle, ws_port))),
        }
    }

    /**
     * プロセスの健全性を監視し、必要に応じて再起動する
     */
    pub async fn start_health_monitor(&self) {
        let process_arc = Arc::clone(&self.process);
        let should_stop = Arc::clone(&self.should_stop);
        let process_manager = Arc::clone(&self.process_manager);
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(HEALTH_CHECK_INTERVAL_SECS));
            
            while !should_stop.load(Ordering::Relaxed) {
                interval.tick().await;
                
                let needs_restart = {
                    let mut process_guard = match process_arc.try_lock() {
                        Ok(guard) => guard,
                        Err(_) => continue, // ロックできない場合はスキップ
                    };
                    
                    if let Some(ref mut child) = process_guard.as_mut() {
                        match child.try_wait() {
                            Ok(Some(status)) => {
                                error!("Cloudflared process exited with status: {:?}", status);
                                if let Some(code) = status.code() {
                                    error!("Exit code: {}", code);
                                } else {
                                    error!("Process terminated by signal");
                                }
                                true // 再起動が必要
                            }
                            Ok(None) => {
                                debug!("Cloudflared process is still running");
                                false // 再起動不要
                            }
                            Err(e) => {
                                error!("Error checking cloudflared process status: {}", e);
                                true // エラーの場合も再起動を試行
                            }
                        }
                    } else {
                        warn!("Cloudflared process handle is None");
                        true // プロセスハンドルがない場合は再起動
                    }
                };
                
                if needs_restart {
                    let can_restart = {
                        let mut manager = process_manager.lock().unwrap();
                        manager.increment_restart_attempts();
                        manager.can_restart()
                    };
                    
                    if can_restart {
                        info!("Attempting to restart cloudflared process...");
                        
                        // 少し待ってから再起動
                        sleep(Duration::from_secs(RESTART_DELAY_SECS)).await;
                        
                        if let Err(e) = Self::restart_process(&process_arc, &process_manager).await {
                            error!("Failed to restart cloudflared process: {}", e);
                        } else {
                            info!("Cloudflared process restarted successfully");
                        }
                    } else {
                        error!("Maximum restart attempts ({}) reached, giving up", MAX_RESTART_ATTEMPTS);
                        break;
                    }
                }
            }
            
            info!("Health monitor stopped");
        });
    }
    
    /**
     * プロセスを再起動する
     */
    async fn restart_process(
        process_arc: &Arc<Mutex<Option<Child>>>,
        process_manager: &Arc<Mutex<ProcessManager>>
    ) -> Result<(), TunnelError> {
        let (app_handle, ws_port) = {
            let manager = process_manager.lock().unwrap();
            (manager.app_handle.clone(), manager.ws_port)
        };
        
        // cloudflaredマネージャーを初期化
        let manager = CloudflaredManager::new(app_handle)?;
        let binary_path = manager.ensure_cloudflared().await?;
        
        // コマンド引数を構築
        let args = Self::build_cloudflared_args(ws_port);
        
        info!("Restarting cloudflared with args: {:?}", args.join(" "));
        
        // 新しいプロセスを起動
        let mut child = TokioCommand::new(&binary_path)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                error!("Failed to spawn cloudflared process during restart: {}", e);
                e
            })?;
        
        info!("New cloudflared process spawned with PID: {:?}", child.id());
        
        // SIGPIPEを防ぐため、再起動時も即座にバックグラウンドログ読み取りを開始
        if let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) {
            use tokio::io::{AsyncBufReadExt, BufReader};
            
            let mut stdout_reader = BufReader::new(stdout).lines();
            let mut stderr_reader = BufReader::new(stderr).lines();
            
            tokio::spawn(async move {
                info!("Starting background log reading for restarted process...");
                loop {
                    tokio::select! {
                        line = stdout_reader.next_line() => {
                            match line {
                                Ok(Some(line_str)) => {
                                    debug!("cloudflared stdout (restart): {}", line_str);
                                }
                                Ok(None) => {
                                    debug!("cloudflared stdout stream ended (restart)");
                                    break;
                                }
                                Err(e) => {
                                    debug!("Error reading cloudflared stdout (restart): {}", e);
                                    break;
                                }
                            }
                        }
                        line = stderr_reader.next_line() => {
                            match line {
                                Ok(Some(line_str)) => {
                                    debug!("cloudflared stderr (restart): {}", line_str);
                                }
                                Ok(None) => {
                                    debug!("cloudflared stderr stream ended (restart)");
                                    break;
                                }
                                Err(e) => {
                                    debug!("Error reading cloudflared stderr (restart): {}", e);
                                    break;
                                }
                            }
                        }
                    }
                }
                info!("Background log reading for restarted process completed");
            });
        }
        
        // 古いプロセスを置き換え
        {
            let mut process_guard = process_arc.lock().unwrap();
            *process_guard = Some(child);
        }
        
        {
            let mut manager = process_manager.lock().unwrap();
            manager.set_running(true);
        }
        
        Ok(())
    }
    
    /**
     * cloudflaredコマンドの引数を構築する
     */
    fn build_cloudflared_args(ws_port: u16) -> Vec<String> {
        let mut args = vec![
            "tunnel".to_string(),
            "--url".to_string(),
            format!("http://127.0.0.1:{}", ws_port),
            "--no-autoupdate".to_string(),
        ];
        
        // プロトコル設定を削除してCloudflareのデフォルト動作に任せる
        // Issue #45の修正: macOSでWebSocket接続が失敗する問題を解決
        // args.push("--protocol".to_string());
        // args.push("auto".to_string());
        
        // WebSocket接続改善のための設定
        args.push("--compression-quality".to_string());
        args.push("0".to_string()); // 圧縮を無効化してWebSocketを安定化
        
        // macOS固有の設定
        #[cfg(target_os = "macos")]
        {
            args.push("--http-host-header".to_string());
            args.push("localhost".to_string());
            args.push("--origin-server-name".to_string());
            args.push("localhost".to_string());
        }
        
        // 環境変数から追加引数を取得して追加
        if let Ok(extra_args_str) = std::env::var("CLOUDFLARED_EXTRA_ARGS") {
            if !extra_args_str.is_empty() {
                args.extend(extra_args_str.split_whitespace().map(String::from));
            }
        }
        
        // 環境変数からログレベルを取得して追加（存在する場合）
        let log_level = std::env::var("CLOUDFLARED_LOG_LEVEL").unwrap_or_else(|_| "info".to_string());
        if !log_level.is_empty() {
            args.push("--loglevel".to_string());
            args.push(log_level);
        }
        
        args
    }
}

/// トンネルを起動し、WebSocketサーバーをインターネットに公開する
///
/// Cloudflare Quick Tunnelを使用して、ローカルで実行されているWebSocketサーバーを
/// インターネットに安全に公開します。動的にダウンロードしたcloudflaredバイナリを使用し、
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

    // cloudflaredマネージャーを初期化
    let manager = CloudflaredManager::new(app.clone())?;
    
    // cloudflaredバイナリを確保（存在しない場合はダウンロード）
    let binary_path = manager.ensure_cloudflared().await?;
    info!("Using cloudflared binary at: {:?}", binary_path);

    // cloudflaredコマンドの引数を構築
    let args = TunnelInfo::build_cloudflared_args(ws_port);

    info!(
        "Attempting to start cloudflared with args: {:?}",
        args.join(" ")
    );
    info!("Full command: {} {}", binary_path.display(), args.join(" "));
    
    // SIGPIPE対策のための環境変数設定
    #[cfg(unix)]
    {
        std::env::set_var("RUST_BACKTRACE", "1");
        // SIGPIPEエラーを防ぐための環境変数
        std::env::set_var("CLOUDFLARED_NO_CHUNKED_ENCODING", "true");
    }

    // tokioプロセスを使用してcloudflaredを起動
    // SIGPIPEエラーを回避するための設定を追加
    let mut command = TokioCommand::new(&binary_path);
    command
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true); // プロセスがドロップされたときに終了させる
    
    // macOS固有の設定
    #[cfg(target_os = "macos")]
    {
        // macOSでSIGPIPEを無視する設定
        command.stdin(Stdio::null()); // 標準入力を閉じる
    }
    
    let mut child = command
        .spawn()
        .map_err(|e| {
            error!("Failed to spawn cloudflared process: {}", e);
            error!("Binary path: {}", binary_path.display());
            error!("Args: {:?}", args);
            e
        })?;

    info!("Cloudflared process spawned successfully with PID: {:?}", child.id());

    // 標準出力と標準エラー出力を非同期で読み取り
    let stdout = child.stdout.take().ok_or(TunnelError::StdioError)?;
    let stderr = child.stderr.take().ok_or(TunnelError::StdioError)?;

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    // プロセスのためのArc<Mutex<Option<Child>>>を作成
    let child_arc = Arc::new(Mutex::new(Some(child)));

    // URL抽出ロジック（タイムアウト付き）
    // SIGPIPEを防ぐため、URL抽出後もログ読み取りを継続
    let url_extraction = async {
        info!("Starting URL extraction from cloudflared output...");
        let found_url = None;
        
        loop {
            tokio::select! {
                line = stdout_reader.next_line() => {
                    match line {
                        Ok(Some(line_str)) => {
                            info!("cloudflared stdout: {}", line_str);
                            
                            // 標準出力からTunnelのURLを検索
                            if found_url.is_none() {
                                if let Some(mat) = URL_REGEX.find(&line_str) {
                                    let url = mat.as_str().to_string();
                                    info!("Cloudflare Tunnel URL found: {}", url);
                                    
                                    // URLが見つかったらバックグラウンドで継続読み取り開始
                                    let mut stdout_reader_bg = stdout_reader;
                                    let mut stderr_reader_bg = stderr_reader;
                                    tokio::spawn(async move {
                                        info!("Starting background log reading to prevent SIGPIPE...");
                                        loop {
                                            tokio::select! {
                                                line = stdout_reader_bg.next_line() => {
                                                    match line {
                                                        Ok(Some(line_str)) => {
                                                            debug!("cloudflared stdout (bg): {}", line_str);
                                                        }
                                                        Ok(None) => {
                                                            debug!("cloudflared stdout stream ended (bg)");
                                                            break;
                                                        }
                                                        Err(e) => {
                                                            debug!("Error reading cloudflared stdout (bg): {}", e);
                                                            break;
                                                        }
                                                    }
                                                }
                                                line = stderr_reader_bg.next_line() => {
                                                    match line {
                                                        Ok(Some(line_str)) => {
                                                            debug!("cloudflared stderr (bg): {}", line_str);
                                                        }
                                                        Ok(None) => {
                                                            debug!("cloudflared stderr stream ended (bg)");
                                                            break;
                                                        }
                                                        Err(e) => {
                                                            debug!("Error reading cloudflared stderr (bg): {}", e);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        info!("Background log reading task completed");
                                    });
                                    
                                    return Ok(url);
                                }
                            }
                        }
                        Ok(None) => {
                            warn!("cloudflared stdout stream ended");
                            break;
                        }
                        Err(e) => {
                            error!("Error reading cloudflared stdout: {}", e);
                            return Err(TunnelError::StdioError);
                        }
                    }
                }
                line = stderr_reader.next_line() => {
                    match line {
                        Ok(Some(line_str)) => {
                            warn!("cloudflared stderr: {}", line_str);
                            
                            // 標準エラー出力からもURLを検索
                            if found_url.is_none() {
                                if let Some(mat) = URL_REGEX.find(&line_str) {
                                    let url = mat.as_str().to_string();
                                    info!("Cloudflare Tunnel URL found in stderr: {}", url);
                                    
                                    // URLが見つかったらバックグラウンドで継続読み取り開始
                                    let mut stdout_reader_bg = stdout_reader;
                                    let mut stderr_reader_bg = stderr_reader;
                                    tokio::spawn(async move {
                                        info!("Starting background log reading to prevent SIGPIPE...");
                                        loop {
                                            tokio::select! {
                                                line = stdout_reader_bg.next_line() => {
                                                    match line {
                                                        Ok(Some(line_str)) => {
                                                            debug!("cloudflared stdout (bg): {}", line_str);
                                                        }
                                                        Ok(None) => {
                                                            debug!("cloudflared stdout stream ended (bg)");
                                                            break;
                                                        }
                                                        Err(e) => {
                                                            debug!("Error reading cloudflared stdout (bg): {}", e);
                                                            break;
                                                        }
                                                    }
                                                }
                                                line = stderr_reader_bg.next_line() => {
                                                    match line {
                                                        Ok(Some(line_str)) => {
                                                            debug!("cloudflared stderr (bg): {}", line_str);
                                                        }
                                                        Ok(None) => {
                                                            debug!("cloudflared stderr stream ended (bg)");
                                                            break;
                                                        }
                                                        Err(e) => {
                                                            debug!("Error reading cloudflared stderr (bg): {}", e);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        info!("Background log reading task completed");
                                    });
                                    
                                    return Ok(url);
                                }
                            }
                        }
                        Ok(None) => {
                            warn!("cloudflared stderr stream ended");
                            break;
                        }
                        Err(e) => {
                            error!("Error reading cloudflared stderr: {}", e);
                            return Err(TunnelError::StdioError);
                        }
                    }
                }
            }
        }
        
        if let Some(url) = found_url {
            Ok(url)
        } else {
            Err(TunnelError::UrlNotFound)
        }
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
            let tunnel_info = TunnelInfo {
                process: child_arc,
                url: url.clone(),
                should_stop: Arc::new(AtomicBool::new(false)),
                process_manager: Arc::new(Mutex::new(ProcessManager::new(app.clone(), ws_port))),
            };
            
            // プロセスの健全性監視を開始
            tunnel_info.start_health_monitor().await;
            
            Ok(tunnel_info)
        }
        Ok(Err(e)) => {
            // URL抽出中のエラー: プロセスは起動しているので終了処理
            error!("Error while extracting URL: {}", e);
            let child_to_kill = {
                let mut child_guard = child_arc.lock().unwrap();
                child_guard.take()
            };
            if let Some(mut child) = child_to_kill {
                if let Err(kill_err) = child.kill().await {
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
            
            // プロセスの状態を確認してから終了
            let child_to_kill = {
                let mut child_guard = child_arc.lock().unwrap();
                child_guard.take()
            };
            if let Some(mut child) = child_to_kill {
                // プロセスの状態を確認
                match child.try_wait() {
                    Ok(Some(status)) => {
                        error!("Cloudflared process already exited with status: {:?}", status);
                    }
                    Ok(None) => {
                        info!("Cloudflared process is still running, sending kill signal...");
                        if let Err(kill_err) = child.kill().await {
                            error!("Failed to kill timed out cloudflared process: {}", kill_err);
                        } else {
                            info!("Killed cloudflared process due to timeout");
                        }
                    }
                    Err(e) => {
                        error!("Error checking cloudflared process status before kill: {}", e);
                        // 強制終了を試行
                        let _ = child.kill().await;
                    }
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
    // 健全性監視を停止
    tunnel_info.should_stop.store(true, Ordering::Relaxed);
    info!("Health monitor stop signal sent");
    
    // Mutexからプロセスのオプションを取り出す
    let maybe_child = tunnel_info.process.lock().unwrap().take();

    if let Some(mut child) = maybe_child {
        info!(
            "Stopping cloudflared tunnel process for URL: {}",
            tunnel_info.url
        );
        
        // プロセスの状態を確認してから終了処理
        match child.try_wait() {
            Ok(Some(status)) => {
                info!("Cloudflared process already exited with status: {:?}", status);
            }
            Ok(None) => {
                info!("Sending termination signal to cloudflared process...");
                match child.kill().await {
                    Ok(_) => {
                        info!("Termination signal sent successfully");
                        
                        // プロセスの終了を待つ（タイムアウト付き）
                        match timeout(Duration::from_secs(5), child.wait()).await {
                            Ok(Ok(status)) => {
                                info!("Cloudflared process exited gracefully with status: {:?}", status);
                            }
                            Ok(Err(e)) => {
                                error!("Error waiting for cloudflared process to exit: {}", e);
                            }
                            Err(_) => {
                                warn!("Timeout waiting for cloudflared process to exit, process may still be running");
                            }
                        }
                    }
                    Err(e) => {
                        error!("Failed to send termination signal to cloudflared process: {}", e);
                    }
                }
            }
            Err(e) => {
                error!("Error checking cloudflared process status before termination: {}", e);
                // エラーが発生しても終了を試行
                let _ = child.kill().await;
            }
        }
    } else {
        info!("Tunnel process already taken or stopped.");
    }
    
    info!("Tunnel stop process completed");
}
