// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// --- モジュール宣言 ---
mod commands; // コマンドモジュール
mod state; // 状態管理モジュール
mod ws_server; // WebSocket サーバーロジック

// --- use宣言 ---
// actix-web と tokio は commands モジュール内で主に使用されるため、ここでは不要になる可能性
// use actix_web::{get, App, Error, HttpRequest, HttpResponse, HttpServer};
// use actix_web_actors::ws;
// use std::thread;
// use tokio::runtime::Runtime;
use state::AppState;

fn main() {
    // --- WebSocketサーバーの自動起動コードを削除 ---
    /*
    thread::spawn(|| {
        let rt = Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(async {
            if let Err(e) = start_server().await { // start_server は commands に移動
                eprintln!("WebSocket server error: {}", e);
            }
        });
    });
    */

    tauri::Builder::default()
        // --- AppState を Tauri で管理 ---
        .manage(AppState::new())
        // --- Tauri コマンドハンドラーを登録 ---
        .invoke_handler(tauri::generate_handler![
            commands::start_websocket_server,
            commands::stop_websocket_server,
            commands::set_wallet_address,
            commands::get_streamer_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
