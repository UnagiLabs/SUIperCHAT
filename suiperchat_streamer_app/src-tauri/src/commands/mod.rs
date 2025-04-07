pub mod app_info;
/**
 * IPCコマンドモジュール
 *
 * フロントエンドからのIPC呼び出しに対応するコマンド関数を定義します。
 * 各コマンドはRustバックエンドの機能をフロントエンドに公開します。
 *
 * @module commands
 */
pub mod greeting;
pub mod server;
