/**
 * SUIperCHAT Tauriアプリのバックエンド実装
 *
 * Tauriアプリケーションの初期化とIPC通信のセットアップを行います。
 * IPCコマンドを介してフロントエンドとバックエンド間の通信を可能にします。
 *
 * @module app_lib
 */
// コマンドモジュールをインポート
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        // IPC用コマンドを登録
        .invoke_handler(tauri::generate_handler![
            commands::greeting::greet,
            commands::app_info::get_app_version,
            commands::server::start_server,
            commands::server::stop_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
