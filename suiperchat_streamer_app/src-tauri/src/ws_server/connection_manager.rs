//! 接続管理モジュール
//!
//! WebSocket接続の追加・削除・管理を行います。

use super::client_info::ClientInfo;
use crate::types::{
    decrement_connections, get_connections_count, increment_connections, ConnectionsInfo,
};
use crate::ws_server::session::Broadcast;
use actix::prelude::*;
use lazy_static::lazy_static;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Emitter; // for Addr

/// ## セッションエントリ
///
/// ClientInfo と対応する WebSocket セッションのアドレスを保持する構造体
#[derive(Debug)]
pub struct SessionEntry {
    pub client_info: ClientInfo,
    pub addr: Addr<crate::ws_server::session::WsSession>,
}

/// ## 接続管理
///
/// 接続の追加、削除、情報取得を行います。
/// スレッド間で安全に共有するために、`Arc<Mutex<...>>`でラップされています。
#[derive(Debug, Clone)]
pub struct ConnectionManager {
    /// 接続中のセッション情報
    /// キーはクライアントID、値はSessionEntry
    connections: Arc<Mutex<HashMap<String, SessionEntry>>>,
    /// 最大接続数
    max_connections: Arc<Mutex<usize>>,
    /// Tauriアプリケーションハンドル（イベント発行用）
    app_handle: Option<tauri::AppHandle>,
}

impl ConnectionManager {
    /// ## 新しい接続マネージャーを作成
    ///
    /// ### Arguments
    /// - `max_connections`: 許可する最大接続数
    ///
    /// ### Returns
    /// - `Self`: 新しい接続マネージャーインスタンス
    pub fn new(max_connections: usize) -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            max_connections: Arc::new(Mutex::new(max_connections)),
            app_handle: None,
        }
    }

    /// ## Tauriアプリケーションハンドルを設定
    ///
    /// イベント発行のためのアプリケーションハンドルを設定します。
    ///
    /// ### Arguments
    /// - `app_handle`: Tauriアプリケーションハンドル
    pub fn set_app_handle(&mut self, app_handle: tauri::AppHandle) {
        self.app_handle = Some(app_handle);
    }

    /// ## 最大接続数を設定
    ///
    /// ### Arguments
    /// - `max`: 新しい最大接続数
    pub fn set_max_connections(&self, max: usize) {
        let mut max_conn = self.max_connections.lock().unwrap();
        *max_conn = max;
        self.emit_connections_updated();
    }

    /// ## 最大接続数を取得
    ///
    /// ### Returns
    /// - `usize`: 現在設定されている最大接続数
    pub fn get_max_connections(&self) -> usize {
        *self.max_connections.lock().unwrap()
    }

    /// ## クライアントを追加
    ///
    /// 新しい接続を接続リストに追加します。
    ///
    /// ### Arguments
    /// - `client_info`: 追加するクライアント情報
    /// - `addr`: WebSocketセッションのアドレス
    ///
    /// ### Returns
    /// - `bool`: 追加に成功した場合はtrue、最大接続数に達していて追加できなかった場合はfalse
    pub fn add_client(
        &self,
        client_info: ClientInfo,
        addr: Addr<crate::ws_server::session::WsSession>,
    ) -> bool {
        println!(
            "Debug: add_client method started for client: {}",
            client_info.id
        ); // ★追加★

        let max_conn = self.get_max_connections();
        let current_count = get_connections_count();

        println!(
            "Debug: Current connections: {}, Max connections: {}",
            current_count, max_conn
        ); // ★追加★

        // 最大接続数チェック
        if current_count >= max_conn {
            println!(
                "最大接続数に達しました。接続を拒否します: {}",
                current_count
            );
            println!("Debug: add_client method finished, returning false (max connections)."); // ★追加★
            return false;
        }

        println!("Debug: Incrementing connections count."); // ★追加★
                                                            // 接続カウンターをインクリメント
        increment_connections();
        println!("Debug: Connections count incremented."); // ★追加★

        // セッションエントリをマップに追加
        let client_id = client_info.id.clone();
        let entry = SessionEntry {
            client_info: client_info.clone(),
            addr,
        };
        {
            // ★スコープ開始★
            println!("Debug: Attempting to lock connections map."); // ★追加★
            let mut connections = self.connections.lock().unwrap();
            println!(
                "Debug: Connections map locked. Inserting client: {}",
                client_id
            ); // ★追加★
            connections.insert(client_id, entry);
            println!("Debug: Client inserted into connections map."); // ★追加★
        } // ★スコープ終了 - ここでロックが解放される★

        println!("Debug: Emitting connections updated event."); // ★追加★
                                                                // イベント発行
        self.emit_connections_updated();
        println!("Debug: Connections updated event emitted."); // ★追加★

        println!("Debug: add_client method finished, returning true."); // ★追加★
        true // 追加成功
    }

    /// ## クライアントを削除
    ///
    /// 指定されたIDのクライアント接続を削除します。
    ///
    /// ### Arguments
    /// - `client_id`: 削除するクライアントのID
    ///
    /// ### Returns
    /// - `bool`: 削除に成功した場合はtrue、指定されたIDのクライアントが見つからない場合はfalse
    pub fn remove_client(&self, client_id: &str) -> bool {
        let removed;
        // --- Lock scope starts ---
        {
            let mut connections = self.connections.lock().unwrap();
            removed = connections.remove(client_id).is_some();
        } // --- Lock scope ends ---

        if removed {
            // 接続カウンターをデクリメント (ロック解放後)
            decrement_connections();
            // イベント発行 (ロック解放後)
            self.emit_connections_updated();
            true
        } else {
            false
        }
    }

    /// ## クライアント情報を取得
    ///
    /// 指定されたIDのクライアント情報を取得します。
    ///
    /// ### Arguments
    /// - `client_id`: 取得するクライアントのID
    ///
    /// ### Returns
    /// - `Option<ClientInfo>`: クライアント情報（見つからない場合はNone）
    pub fn get_client(&self, client_id: &str) -> Option<ClientInfo> {
        let connections = self.connections.lock().unwrap();
        connections
            .get(client_id)
            .map(|entry| entry.client_info.clone())
    }

    /// ## クライアント情報を更新
    ///
    /// 指定されたIDのクライアント情報を更新します。
    ///
    /// ### Arguments
    /// - `client_id`: 更新するクライアントのID
    /// - `updater`: ClientInfoを更新する関数
    ///
    /// ### Returns
    /// - `bool`: 更新に成功した場合はtrue、指定されたIDのクライアントが見つからない場合はfalse
    pub fn update_client<F>(&self, client_id: &str, updater: F) -> bool
    where
        F: FnOnce(&mut ClientInfo),
    {
        let mut connections = self.connections.lock().unwrap();

        if let Some(entry) = connections.get_mut(client_id) {
            updater(&mut entry.client_info);
            true
        } else {
            false
        }
    }

    /// ## 全クライアント情報を取得
    ///
    /// ### Returns
    /// - `Vec<ClientInfo>`: 全クライアント情報のベクター
    pub fn get_all_clients(&self) -> Vec<ClientInfo> {
        println!("Debug: get_all_clients method started."); // ★追加★
        println!("Debug: Attempting to lock connections map in get_all_clients."); // ★追加★
        let connections = self.connections.lock().unwrap();
        println!("Debug: Connections map locked in get_all_clients."); // ★追加★
        println!("Debug: Collecting client info."); // ★追加★
        let clients = connections
            .values()
            .map(|entry| entry.client_info.clone())
            .collect();
        println!("Debug: Client info collected."); // ★追加★
        println!("Debug: get_all_clients method finished."); // ★追加★
        clients
    }

    /// ## 接続情報を取得
    ///
    /// 現在の接続状況に関する情報を取得します。
    ///
    /// ### Returns
    /// - `ConnectionsInfo`: 接続情報
    pub fn get_connections_info(&self) -> ConnectionsInfo {
        println!("Debug: get_connections_info method started."); // ★追加★
        println!("Debug: Getting connections count."); // ★追加★
        let active_connections = get_connections_count();
        println!("Debug: Connections count obtained: {}", active_connections); // ★追加★

        println!("Debug: Getting max connections."); // ★追加★
        let max_connections = self.get_max_connections();
        println!("Debug: Max connections obtained: {}", max_connections); // ★追加★

        println!("Debug: Getting all clients."); // ★追加★
        let clients = self.get_all_clients();
        println!("Debug: All clients obtained (count: {}).", clients.len()); // ★追加★

        println!("Debug: Creating ConnectionsInfo struct."); // ★追加★
        let info = ConnectionsInfo {
            active_connections,
            max_connections,
            clients,
        };
        println!("Debug: ConnectionsInfo struct created."); // ★追加★
        println!("Debug: get_connections_info method finished."); // ★追加★
        info
    }

    /// ## 接続更新イベントを発行
    ///
    /// 接続状態が変更された際にイベントを発行します。
    fn emit_connections_updated(&self) {
        println!("Debug: emit_connections_updated method started."); // ★追加★
        if let Some(app_handle) = &self.app_handle {
            println!("Debug: app_handle is available."); // ★追加★
                                                         // 接続情報を取得
            println!("Debug: Calling get_connections_info."); // ★変更★
            let info = self.get_connections_info();
            println!("Debug: Connections info obtained."); // ★追加★

            // イベント発行
            println!("Debug: Attempting to emit connections_updated event."); // ★追加★
            if let Err(e) = app_handle.emit("connections_updated", info) {
                eprintln!("接続更新イベントの発行に失敗: {}", e);
                println!("Debug: Failed to emit connections_updated event: {}", e);
            // ★追加★
            } else {
                println!("Debug: connections_updated event emitted successfully.");
                // ★追加★
            }
        } else {
            println!("Debug: app_handle is NOT available."); // ★追加★
        }
        println!("Debug: emit_connections_updated method finished."); // ★追加★
    }

    /// ## 全クライアントにメッセージをブロードキャスト
    ///
    /// 受信したメッセージをすべての接続中セッションに送信します。
    pub fn broadcast(&self, message: &str) {
        let connections = self.connections.lock().unwrap();
        for entry in connections.values() {
            // Broadcastメッセージを送信
            entry.addr.do_send(Broadcast(message.to_string()));
        }
    }
}

/// ## グローバル接続マネージャのSingletonインスタンス
///
/// アプリケーション全体で共有される接続マネージャのインスタンスを提供します。
/// 初回アクセス時に作成され、以降はそのインスタンスが返されます。
/// スレッドセーフな実装のため、`lazy_static`とArithmeticを使用しています。
pub mod global {
    use super::*;

    // デフォルトの最大接続数
    const DEFAULT_MAX_CONNECTIONS: usize = 100;

    lazy_static! {
        static ref GLOBAL_CONNECTION_MANAGER: Arc<Mutex<ConnectionManager>> =
            Arc::new(Mutex::new(ConnectionManager::new(DEFAULT_MAX_CONNECTIONS)));
    }

    /// ## グローバル接続マネージャを取得
    ///
    /// ### Returns
    /// - `ConnectionManager`: 接続マネージャのクローン
    pub fn get_manager() -> ConnectionManager {
        GLOBAL_CONNECTION_MANAGER.lock().unwrap().clone()
    }

    /// ## Tauriアプリケーションハンドルを取得
    ///
    /// ### Returns
    /// - `tauri::AppHandle`: アプリケーションハンドルのクローン、設定されていない場合はパニック
    pub fn get_app_handle() -> tauri::AppHandle {
        let manager = GLOBAL_CONNECTION_MANAGER.lock().unwrap();
        if let Some(app_handle) = &manager.app_handle {
            app_handle.clone()
        } else {
            panic!("アプリケーションハンドルが設定されていません。サーバー起動前にこの関数を呼び出さないでください。");
        }
    }

    /// ## Tauriアプリケーションハンドルを設定
    ///
    /// ### Arguments
    /// - `app_handle`: Tauriアプリケーションハンドル
    pub fn set_app_handle(app_handle: tauri::AppHandle) {
        let mut manager = GLOBAL_CONNECTION_MANAGER.lock().unwrap();
        manager.set_app_handle(app_handle.clone());
    }

    /// ## 最大接続数を設定
    ///
    /// ### Arguments
    /// - `max`: 新しい最大接続数
    pub fn set_max_connections(max: usize) {
        let manager = GLOBAL_CONNECTION_MANAGER.lock().unwrap();
        manager.set_max_connections(max);
    }

    /// ## 接続情報を取得
    ///
    /// ### Returns
    /// - `ConnectionsInfo`: 現在の接続情報
    pub fn get_connections_info() -> ConnectionsInfo {
        let manager = GLOBAL_CONNECTION_MANAGER.lock().unwrap();
        manager.get_connections_info()
    }

    /// ## 指定されたIDのクライアントを切断
    ///
    /// ### Arguments
    /// - `client_id`: 切断するクライアントのID
    ///
    /// ### Returns
    /// - `bool`: 切断に成功した場合はtrue、クライアントが見つからない場合はfalse
    pub fn disconnect_client(client_id: &str) -> bool {
        let manager = GLOBAL_CONNECTION_MANAGER.lock().unwrap();
        manager.remove_client(client_id)
    }
}
