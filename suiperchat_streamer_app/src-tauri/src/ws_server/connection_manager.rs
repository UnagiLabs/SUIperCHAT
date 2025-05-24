//! 接続管理モジュール
//!
//! WebSocket接続の追加・削除・管理を行います。

use super::client_info::ClientInfo;
use crate::types::{
    decrement_connections, get_connections_count, increment_connections, ConnectionsInfo,
};
use crate::ws_server::session::Broadcast;
use actix::prelude::*;
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
        let max_conn = self.get_max_connections();
        let current_count = get_connections_count();

        // 最大接続数チェック
        if current_count >= max_conn {
            println!(
                "最大接続数に達しました。接続を拒否します: {}",
                current_count
            );
            return false;
        }

        // 接続カウンターをインクリメント
        increment_connections();

        // セッションエントリをマップに追加
        let client_id = client_info.id.clone();
        let entry = SessionEntry {
            client_info: client_info.clone(),
            addr,
        };
        {
            let mut connections = self.connections.lock().unwrap();
            connections.insert(client_id, entry);
        }

        // イベント発行
        self.emit_connections_updated();
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
        let connections = self.connections.lock().unwrap();
        connections
            .values()
            .map(|entry| entry.client_info.clone())
            .collect()
    }

    /// ## 接続情報を取得
    ///
    /// 現在の接続状況に関する情報を取得します。
    ///
    /// ### Returns
    /// - `ConnectionsInfo`: 接続情報
    pub fn get_connections_info(&self) -> ConnectionsInfo {
        let active_connections = get_connections_count();
        let max_connections = self.get_max_connections();
        let clients = self.get_all_clients();

        ConnectionsInfo {
            active_connections,
            max_connections,
            clients,
        }
    }

    /// ## 接続更新イベントを発行
    ///
    /// 接続状態が変更された際にイベントを発行します。
    fn emit_connections_updated(&self) {
        if let Some(app_handle) = &self.app_handle {
            // 接続情報を取得
            let info = self.get_connections_info();

            // イベント発行
            if let Err(e) = app_handle.emit("connections_updated", info) {
                eprintln!("接続更新イベントの発行に失敗: {}", e);
            }
        }
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

/// ## グローバルモジュール
///
/// グローバルに共有されるコネクションマネージャーへのアクセスを提供する
pub mod global {
    use super::*;
    use once_cell::sync::OnceCell;

    // デフォルトの最大接続数
    const DEFAULT_MAX_CONNECTIONS: usize = 100;

    /// グローバル接続マネージャーのインスタンス
    static MANAGER: OnceCell<ConnectionManager> = OnceCell::new();

    /// グローバルなTauriアプリケーションハンドル
    static APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();

    /// ## 接続マネージャーのインスタンスを取得する
    ///
    /// まだ初期化されていない場合は新しいインスタンスを作成します。
    ///
    /// ### Returns
    /// - `ConnectionManager`: グローバル接続マネージャー
    pub fn get_manager() -> ConnectionManager {
        MANAGER
            .get_or_init(|| ConnectionManager::new(DEFAULT_MAX_CONNECTIONS))
            .clone()
    }

    /// ## Tauriアプリケーションハンドルを設定する
    ///
    /// グローバルなアプリケーションハンドルを設定します。
    ///
    /// ### Arguments
    /// - `handle`: 設定するアプリケーションハンドル
    pub fn set_app_handle(handle: tauri::AppHandle) {
        let _ = APP_HANDLE.set(handle.clone());

        // 接続マネージャーにアプリケーションハンドルも設定
        let mut manager = get_manager();
        manager.set_app_handle(handle);
    }

    /// ## Tauriアプリケーションハンドルを取得する
    ///
    /// ### Returns
    /// - `Option<tauri::AppHandle>`: 設定されたアプリケーションハンドル（設定されていない場合はNone）
    pub fn get_app_handle() -> Option<tauri::AppHandle> {
        APP_HANDLE.get().cloned()
    }

    /// ## 最大接続数を設定
    ///
    /// ### Arguments
    /// - `max`: 新しい最大接続数
    pub fn set_max_connections(max: usize) {
        let manager = get_manager();
        manager.set_max_connections(max);
    }

    /// ## 接続情報を取得
    ///
    /// ### Returns
    /// - `ConnectionsInfo`: 現在の接続情報
    pub fn get_connections_info() -> ConnectionsInfo {
        let manager = get_manager();
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
        let manager = get_manager();
        manager.remove_client(client_id)
    }
}
