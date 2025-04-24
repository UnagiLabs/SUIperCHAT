/**
 * Loopholeトンネル関連の構造体とエラー型
 *
 * このモジュールはLoophole CLIを使用したトンネリング機能を管理します。
 * WebSocketサーバーをインターネットに公開するためのトンネル情報と
 * 関連するエラー型を定義します。
 */
// std::process::Child を削除し、tauri_plugin_shell::process::CommandChild をインポート
// use std::process::Child;
use tauri_plugin_shell::process::CommandChild;
use std::sync::{Arc, Mutex};
use thiserror::Error;

/**
 * トンネル情報を保持する構造体
 *
 * @property {Arc<Mutex<CommandChild>>} process - LoopholeのCLIプロセスへの参照 (CommandChild型)
 * @property {String} url - 生成されたHTTPSトンネルURL
 */
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
    pub fn new(process: CommandChild, url: String) -> Self { // 引数の型を CommandChild に変更
        Self {
            process: Arc::new(Mutex::new(process)), // CommandChild を Mutex 内に移動
            url,
        }
    }
}
