//! WebSocketセッション管理モジュール
//!
//! WebSocketセッションのライフサイクル管理と、メッセージの処理を行います。

use super::{client_info::ClientInfo, connection_manager::ConnectionManager};
use crate::database;
use crate::db_models;
use crate::state::AppState;
use crate::types::{
    ClientMessage, MessageType, ServerResponse, CLIENT_TIMEOUT, HEARTBEAT_INTERVAL,
};
use actix::prelude::*;
use actix::Message;
use actix_web::HttpRequest;
use actix_web_actors::ws;
use chrono::Utc;
use log::{error, info};
use std::time::Instant;
use tauri::Manager;

/// ## WsSession アクター
///
/// 各 WebSocket クライアント接続を管理するアクター。
/// ハートビートを送信し、クライアントからの応答を監視します。
/// 受信したメッセージを処理します。
#[derive(Debug)]
pub struct WsSession {
    /// クライアントからの最後のハートビート受信時刻
    hb: Instant,
    /// クライアント情報
    client_info: Option<ClientInfo>,
    /// 接続マネージャー（共有状態）
    connection_manager: Option<ConnectionManager>,
    /// リクエスト情報（クライアントのIPアドレス等）
    req: Option<HttpRequest>,
    /// Tauriアプリケーションハンドル
    app_handle: Option<tauri::AppHandle>,
    /// 現在のセッションID
    session_id: Option<i32>,
}

impl Default for WsSession {
    fn default() -> Self {
        Self::new()
    }
}

impl WsSession {
    /// ## 新しい WsSession を作成する
    ///
    /// ### Returns
    /// - `Self`: 新しい WsSession インスタンス
    pub fn new() -> Self {
        Self {
            hb: Instant::now(),
            client_info: None,
            connection_manager: None,
            req: None,
            app_handle: None,
            session_id: None,
        }
    }

    /// ## 接続マネージャーを設定する
    ///
    /// 接続管理のためのマネージャーを設定します。
    ///
    /// ### Arguments
    /// - `manager`: 接続マネージャー
    pub fn with_connection_manager(mut self, manager: ConnectionManager) -> Self {
        self.connection_manager = Some(manager);
        self
    }

    /// ## リクエスト情報を設定する
    ///
    /// クライアント情報取得のためのHTTPリクエストを設定します。
    ///
    /// ### Arguments
    /// - `request`: HTTPリクエスト
    pub fn with_request(mut self, request: HttpRequest) -> Self {
        self.req = Some(request);
        self
    }

    /// ## アプリケーションハンドルを設定する
    ///
    /// Tauriアプリケーションハンドルを設定します。
    ///
    /// ### Arguments
    /// - `app_handle`: Tauriアプリケーションハンドル
    pub fn with_app_handle(mut self, app_handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(app_handle);
        self
    }

    /// ## ハートビートチェック
    ///
    /// 定期的にハートビートを送信し、クライアントの生存を確認します。
    ///
    /// ### Arguments
    /// - `ctx`: アクターコンテキスト (`ws::WebsocketContext<Self>`)
    fn hb(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            // クライアントのタイムアウトチェック
            if Instant::now().duration_since(act.hb) > CLIENT_TIMEOUT {
                println!("WebSocket Client heartbeat failed, disconnecting!");

                // クライアント情報がある場合、接続マネージャーから削除
                if let Some(client_info) = &act.client_info {
                    if let Some(manager) = &act.connection_manager {
                        manager.remove_client(&client_info.id);
                        println!("クライアント削除: {}", client_info.id);
                    }
                }

                ctx.stop();
                return;
            }
            // Ping メッセージを送信
            println!("Sending heartbeat ping");
            ctx.ping(b"");
        });
    }

    /// ## エラーレスポンスを作成する
    ///
    /// クライアントに送信するエラーメッセージを作成します。
    ///
    /// ### Arguments
    /// - `error_message`: エラーメッセージの内容
    ///
    /// ### Returns
    /// - `String`: JSONシリアライズされたエラーメッセージ
    fn create_error_response(&self, error_message: &str) -> String {
        let response = ServerResponse {
            message_type: MessageType::Error,
            message: error_message.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        match serde_json::to_string(&response) {
            Ok(json) => json,
            Err(e) => format!(
                "{{\"type\":\"error\",\"message\":\"Failed to serialize error: {}\"}}",
                e
            ),
        }
    }

    /// ## データベースにメッセージを保存する
    ///
    /// 受信したメッセージをデータベースに保存します。
    /// 非同期処理として実行され、アクターをブロックしません。
    ///
    /// ### Arguments
    /// - `message`: 保存するメッセージ
    fn save_message_to_db(&self, message: &ClientMessage) {
        // アプリハンドルとセッションIDが設定されていることを確認
        if let (Some(app_handle), Some(session_id)) = (&self.app_handle, &self.session_id) {
            info!("メッセージをデータベースに保存します");
            let app_handle_clone = app_handle.clone();
            let message_clone = message.clone();
            let session_id_clone = *session_id;

            // メッセージをバックグラウンドで保存
            tokio::spawn(async move {
                // AppStateからデータベースプールを取得
                let db_pool = {
                    let app_state = app_handle_clone.state::<AppState>();
                    let db_pool_guard = match app_state.db_pool.lock() {
                        Ok(guard) => guard,
                        Err(e) => {
                            error!("データベースプールのロック取得に失敗: {}", e);
                            return;
                        }
                    };

                    match &*db_pool_guard {
                        Some(pool) => pool.clone(),
                        None => {
                            error!("データベース接続がありません");
                            return;
                        }
                    }
                };

                // メッセージ型に応じてデータベースモデルを作成
                let db_message = match message_clone {
                    ClientMessage::Chat(chat_msg) => db_models::Message {
                        id: 0, // AUTO INCREMENTのため0を指定
                        session_id: session_id_clone,
                        wallet_address: None,
                        display_name: chat_msg.display_name,
                        message: chat_msg.content,
                        amount: 0.0, // 通常チャットは0
                        tx_hash: None,
                        timestamp: Utc::now(),
                    },
                    ClientMessage::Superchat(superchat_msg) => db_models::Message {
                        id: 0, // AUTO INCREMENTのため0を指定
                        session_id: session_id_clone,
                        wallet_address: Some(superchat_msg.superchat.wallet_address),
                        display_name: superchat_msg.display_name,
                        message: superchat_msg.content,
                        amount: superchat_msg.superchat.amount,
                        tx_hash: Some(superchat_msg.superchat.tx_hash),
                        timestamp: Utc::now(),
                    },
                };

                // データベースに保存
                match database::save_message(&db_pool, &db_message).await {
                    Ok(id) => {
                        info!("メッセージをデータベースに保存しました (ID: {})", id);
                    }
                    Err(e) => {
                        error!("メッセージの保存に失敗: {}", e);
                    }
                }
            });
        } else {
            // アプリハンドルかセッションIDが設定されていない場合
            if self.app_handle.is_none() {
                error!(
                    "アプリケーションハンドルが設定されていないため、メッセージを保存できません"
                );
            }
            if self.session_id.is_none() {
                error!("セッションIDが設定されていないため、メッセージを保存できません");
            }
        }
    }

    /// ## メッセージをブロードキャストする
    ///
    /// 受信したメッセージを適切に処理してブロードキャストします。
    /// 現在はエコーバック（元のクライアントにのみ送信）のみ実装しています。
    ///
    /// ### Arguments
    /// - `message`: 受信したクライアントメッセージ
    /// - `ctx`: アクターコンテキスト
    fn broadcast_message(&self, message: ClientMessage, ctx: &mut ws::WebsocketContext<Self>) {
        // クライアント情報とマネージャーが設定されている場合、メッセージカウンターを更新
        if let (Some(client_info), Some(manager)) = (&self.client_info, &self.connection_manager) {
            manager.update_client(&client_info.id, |info| {
                info.update_activity();
                info.increment_messages();
            });
        }

        // メッセージをデータベースに保存
        self.save_message_to_db(&message);

        let json_result = match &message {
            ClientMessage::Chat(chat_msg) => {
                println!(
                    "Normal chat message from {}: {}",
                    chat_msg.display_name, chat_msg.content
                );
                serde_json::to_string(&chat_msg)
            }
            ClientMessage::Superchat(superchat_msg) => {
                println!(
                    "Super chat message from {}: {}, Amount: {}, TX: {}",
                    superchat_msg.display_name,
                    superchat_msg.content,
                    superchat_msg.superchat.amount,
                    superchat_msg.superchat.tx_hash
                );
                // スパチャの検証ロジックを将来的に実装
                // self.verify_transaction(&superchat_msg.superchat);
                serde_json::to_string(&superchat_msg)
            }
        };

        match json_result {
            Ok(json) => {
                // 全クライアントにメッセージをブロードキャスト
                if let Some(manager) = &self.connection_manager {
                    manager.broadcast(&json);
                }
            }
            Err(e) => {
                eprintln!("メッセージのシリアライズに失敗: {}", e);
                ctx.text(self.create_error_response(&format!("メッセージ処理エラー: {}", e)));
            }
        }
    }
}

/// ## Actor トレイトの実装
///
/// `WsSession` を Actix アクターとして動作させるための実装。
impl Actor for WsSession {
    type Context = ws::WebsocketContext<Self>;

    /// ## アクター開始時の処理
    ///
    /// アクターが開始されたときに呼び出され、ハートビート処理を開始します。
    ///
    /// ### Arguments
    /// - `ctx`: アクターコンテキスト (`ws::WebsocketContext<Self>`)
    fn started(&mut self, ctx: &mut Self::Context) {
        println!("WebSocket Session Started");

        // リクエストからクライアント情報を取得
        if let Some(req) = &self.req {
            if let Some(addr) = req.peer_addr() {
                println!("Debug: peer_addr obtained: {:?}", addr);
                let client_info = ClientInfo::new(addr);
                println!("Debug: ClientInfo created: {:?}", client_info);
                let client_id = client_info.id.clone();
                println!(
                    "New client connected: {} from {}",
                    client_id, client_info.ip
                );

                // 接続マネージャーに追加
                if let Some(manager) = &self.connection_manager {
                    println!("Debug: ConnectionManager is available.");
                    // セッションアドレスを渡して接続登録
                    println!("Debug: Attempting to add client to manager.");
                    if manager.add_client(client_info.clone(), ctx.address()) {
                        println!("Debug: Client added to manager successfully.");
                        self.client_info = Some(client_info);
                        println!("Debug: self.client_info set (manager available).");
                    } else {
                        println!("Debug: manager.add_client returned false (max connections?).");
                        // 最大接続数に達している場合、切断
                        ctx.text(self.create_error_response(
                            "Maximum connections reached. Try again later.",
                        ));
                        ctx.close(None);
                        ctx.stop();
                        return;
                    }
                } else {
                    println!("Debug: ConnectionManager is NOT available.");
                    // 接続マネージャーがない場合でもClientInfoは設定
                    self.client_info = Some(client_info);
                    println!("Debug: self.client_info set (manager NOT available).");
                }
            } else {
                println!("Debug: peer_addr not available.");
            }
        } else {
            println!("Debug: req not available.");
        }

        // アプリケーションハンドルがあれば、現在のセッションIDを取得
        if let Some(app_handle) = &self.app_handle {
            if let Ok(session_id_guard) = app_handle.state::<AppState>().current_session_id.lock() {
                if let Some(session_id) = *session_id_guard {
                    self.session_id = Some(session_id);
                    info!("現在のセッションID: {}", session_id);
                } else {
                    info!("セッションIDが設定されていません");
                }
            } else {
                error!("セッションIDのロックを取得できませんでした");
            }
        }

        println!("Debug: Starting heartbeat.");
        self.hb(ctx);
    }

    /// ## アクター停止時の処理
    ///
    /// アクターが停止したときに呼び出されます。
    ///
    /// ### Arguments
    /// - `_ctx`: アクターコンテキスト (`ws::WebsocketContext<Self>`)
    fn stopped(&mut self, _ctx: &mut Self::Context) {
        println!("WebSocket Session Stopped");

        // クライアント情報がある場合、接続マネージャーから削除
        if let Some(client_info) = &self.client_info {
            if let Some(manager) = &self.connection_manager {
                manager.remove_client(&client_info.id);
                println!("クライアント削除: {}", client_info.id);
            }
        }
    }
}

/// ## StreamHandler トレイトの実装
///
/// WebSocket 接続からのメッセージ (`ws::Message`) を処理します。
impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsSession {
    /// ## メッセージ受信時の処理
    ///
    /// WebSocket クライアントからメッセージを受信したときに呼び出されます。
    /// Ping/Pong、テキスト、バイナリメッセージなどを処理します。
    ///
    /// ### Arguments
    /// - `msg`: 受信したメッセージ (`Result<ws::Message, ws::ProtocolError>`)
    /// - `ctx`: アクターコンテキスト (`ws::WebsocketContext<Self>`)
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        // クライアントのアクティビティを更新
        if let (Some(client_info), Some(manager)) = (&self.client_info, &self.connection_manager) {
            manager.update_client(&client_info.id, |info| {
                info.update_activity();
            });
        }

        match msg {
            // Pong メッセージ受信: ハートビート時刻を更新
            Ok(ws::Message::Pong(_)) => {
                println!("Received pong");
                self.hb = Instant::now();
            }
            // Ping メッセージ受信: Pong メッセージを返信
            Ok(ws::Message::Ping(msg)) => {
                println!("Received ping");
                self.hb = Instant::now();
                ctx.pong(&msg);
            }
            // テキストメッセージ受信: JSONパースしてメッセージ処理
            Ok(ws::Message::Text(text)) => {
                println!("WS Received: {}", text);

                // JSONメッセージのパース処理
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(client_msg) => {
                        // メッセージを処理してブロードキャスト
                        self.broadcast_message(client_msg, ctx);
                    }
                    Err(e) => {
                        // JSONパースエラー
                        eprintln!("メッセージのパースに失敗: {}, 受信内容: {}", e, text);
                        ctx.text(
                            self.create_error_response(&format!("無効なメッセージ形式: {}", e)),
                        );
                    }
                }
            }
            // バイナリメッセージ受信: 現在は未処理
            Ok(ws::Message::Binary(bin)) => {
                println!("WS Received Binary: {} bytes", bin.len());
                // 必要に応じてバイナリデータを処理
                ctx.text(self.create_error_response("バイナリメッセージはサポートされていません"));
            }
            // Close メッセージ受信 or 接続エラー: アクターを停止
            Ok(ws::Message::Close(reason)) => {
                println!("WS Close received: {:?}", reason);
                ctx.close(reason);
                ctx.stop();
            }
            Ok(ws::Message::Continuation(_)) => {
                // 分割メッセージは現在サポートしないため停止
                println!("Continuation messages not supported");
                ctx.text(self.create_error_response("分割メッセージはサポートされていません"));
                ctx.stop();
            }
            Ok(ws::Message::Nop) => (), // 何もしない
            // プロトコルエラー発生: エラーログを出力し、アクターを停止
            Err(e) => {
                eprintln!("WebSocket Protocol Error: {:?}", e);
                ctx.text(
                    self.create_error_response(&format!("WebSocketプロトコルエラー: {:?}", e)),
                );
                ctx.stop();
            }
        }
    }
}

/// ## WebSocket ルートハンドラー用の拡張関数
///
/// WebSocket ハンドラーでWsSessionを接続マネージャと共に作成します。
///
/// ### Arguments
/// - `req`: HTTPリクエスト
///
/// ### Returns
/// - `WsSession`: 接続マネージャと連携したWsSessionインスタンス
pub fn create_ws_session(req: HttpRequest) -> WsSession {
    let manager = super::connection_manager::global::get_manager();
    let app_handle = super::connection_manager::global::get_app_handle();

    WsSession::new()
        .with_connection_manager(manager)
        .with_request(req)
        .with_app_handle(app_handle)
}

/// ## ブロードキャスト用メッセージ
///
/// 他セッションにテキストを送信するためのActixメッセージ
#[derive(Message)]
#[rtype(result = "()")]
pub struct Broadcast(pub String);

impl Handler<Broadcast> for WsSession {
    type Result = ();

    /// ブロードキャストメッセージを受け取り、WebSocketテキストとして送信します
    fn handle(&mut self, msg: Broadcast, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}
