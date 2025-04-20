//! WebSocketサーバーユーティリティ
//!
//! サーバー設定のユーティリティ関数を提供します。

use std::net::SocketAddr;
use std::path::PathBuf;

/// ## 静的ファイルパスを解決する
///
/// 環境に応じて適切な静的ファイルのパスを返します。
/// 開発環境では `src-tauri/src/static` を、
/// 本番環境では実行ファイルのディレクトリの `src/static` を使用します。
///
/// ### Returns
/// - `PathBuf`: 静的ファイルのルートパス
pub fn resolve_static_file_path() -> PathBuf {
    // 開発環境かどうかのチェック
    if cfg!(debug_assertions) {
        // カレントディレクトリからの相対パスを試みる
        let dev_path = PathBuf::from("./src-tauri/src/static");
        if dev_path.exists() {
            println!("Using development static path: {}", dev_path.display());
            return dev_path;
        }

        // Cargo.tomlからの相対パスを試みる
        let cargo_path = PathBuf::from("./src/static");
        if cargo_path.exists() {
            println!("Using Cargo relative static path: {}", cargo_path.display());
            return cargo_path;
        }
    }

    // 実行ファイルからの相対パスを使用（主に本番環境用）
    let exe_path = std::env::current_exe()
        .ok()
        .and_then(|exe_path| exe_path.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let static_path = exe_path.join("src/static");
    println!(
        "Using executable relative static path: {}",
        static_path.display()
    );
    static_path
}

/// ## SocketAddr を URL 文字列にフォーマットするヘルパー関数
///
/// `0.0.0.0` を `127.0.0.1` に置換し、指定されたスキーマとパスで完全なURLを生成します。
///
/// ### Arguments
/// - `addr`: ソケットアドレス
/// - `schema`: URLスキーマ（例: "ws", "http"）
/// - `path`: URLパス（例: "/ws", "/obs/"）
///
/// ### Returns
/// - `String`: フォーマットされたURL
pub fn format_socket_addr(addr: &SocketAddr, schema: &str, path: &str) -> String {
    let ip = match addr.ip() {
        std::net::IpAddr::V4(ip) if ip.is_unspecified() => "127.0.0.1".to_string(),
        ip => ip.to_string(),
    };
    format!("{}://{}:{}{}", schema, ip, addr.port(), path)
}
