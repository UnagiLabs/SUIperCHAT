//! 接続管理モジュール
//!
//! WebSocket接続の追加・削除・管理を行います。

use super::client_info::ClientInfo;
use super::types::{
    decrement_connections, get_connections_count, increment_connections, ConnectionsInfo,
};
use lazy_static::lazy_static;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

/// ## 接続管理
///
/// 接続の追加、削除、情報取得を行います。
/// スレッド間で安全に共有するために、`Arc<Mutex<...>>`でラップされています。
#[derive(Debug, Clone)]
pub struct ConnectionManager {
    /// 接続中のクライアント情報
    /// キーはクライアントID、値はClientInfo
    connections: Arc<Mutex<HashMap<String, ClientInfo>>>,
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
    ///
    /// ### Returns
    /// - `bool`: 追加に成功した場合はtrue、最大接続数に達していて追加できなかった場合はfalse
    pub fn add_client(&self, client_info: ClientInfo) -> bool {
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

        // クライアント情報をマップに追加
        let client_id = client_info.id.clone();
        let mut connections = self.connections.lock().unwrap();
        connections.insert(client_id, client_info);

        // イベント発行
        self.emit_connections_updated();

        true
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
        let mut connections = self.connections.lock().unwrap();

        if connections.remove(client_id).is_some() {
            // 接続カウンターをデクリメント
            decrement_connections();

            // イベント発行
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
        connections.get(client_id).cloned()
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

        if let Some(client_info) = connections.get_mut(client_id) {
            updater(client_info);
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
        connections.values().cloned().collect()
    }

    /// ## 接続情報を取得
    ///
    /// 現在の接続状況に関する情報を取得します。
    ///
    /// ### Returns
    /// - `ConnectionsInfo`: 接続情報
    pub fn get_connections_info(&self) -> ConnectionsInfo {
        ConnectionsInfo {
            active_connections: get_connections_count(),
            max_connections: self.get_max_connections(),
            clients: self.get_all_clients(),
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
