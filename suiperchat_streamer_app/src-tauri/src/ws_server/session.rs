//! WebSocketセッション管理モジュール
//!
//! WebSocketセッションのライフサイクル管理と、メッセージの処理を行います。

use super::{client_info::ClientInfo, connection_manager::ConnectionManager};
use crate::database;
use crate::db_models::Message as DbMessage;
use crate::state::AppState;
use crate::types::{
    ClientMessage, MessageType, ServerResponse, CLIENT_TIMEOUT, HEARTBEAT_INTERVAL,
};
use actix::prelude::*;
use actix::Message;
use actix_web::HttpRequest;
use actix_web_actors::ws;
use chrono::Utc;
use sqlx::sqlite::SqlitePool;
use std::sync::{Arc, Mutex};
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
    /// データベース接続プール
    db_pool: Arc<Mutex<Option<SqlitePool>>>,
    /// 現在のセッションID
    current_session_id: Option<String>,
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
            db_pool: Arc::new(Mutex::new(None)),
            current_session_id: None,
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

    /// ## データベース接続プールを設定する
    ///
    /// データベース操作のための接続プールを設定します。
    ///
    /// ### Arguments
    /// - `db_pool`: データベース接続プール
    pub fn with_db_pool(mut self, db_pool: Arc<Mutex<Option<SqlitePool>>>) -> Self {
        self.db_pool = db_pool;
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

    /// ## メッセージをDBに保存する
    ///
    /// 受信したクライアントメッセージをデータベースに保存します。
    /// チャットとスーパーチャットのみ保存対象とし、システムメッセージは保存しません。
    ///
    /// ### Arguments
    /// - `client_msg`: 保存するクライアントメッセージ (`&ClientMessage`)
    fn save_message_to_db(&self, client_msg: &ClientMessage) {
        // DB接続プールが設定されているか確認
        let db_pool_option = match self.db_pool.lock() {
            Ok(pool_guard) => pool_guard.clone(),
            Err(e) => {
                eprintln!(
                    "エラー: データベース接続プールのロックに失敗しました: {}",
                    e
                );
                return;
            }
        };

        // 接続プールがNoneの場合は処理をスキップ
        let db_pool = match db_pool_option {
            Some(pool) => pool,
            None => {
                println!(
                    "データベース接続プールが初期化されていないため、メッセージを保存できません"
                );
                return;
            }
        };

        // セッションIDの確認
        let session_id = match &self.current_session_id {
            Some(id) => Some(id.clone()),
            None => {
                println!("アクティブなセッションIDがないため、メッセージの関連付けができません");
                None
            }
        };

        // メッセージ情報ログ出力
        let msg_type = match client_msg {
            ClientMessage::Chat(msg) => format!("通常チャット from {}", msg.display_name),
            ClientMessage::Superchat(msg) => format!(
                "スーパーチャット from {}, 金額:{} {}",
                msg.display_name, msg.superchat.amount, msg.superchat.coin
            ),
            ClientMessage::GetHistory { .. } => "履歴取得リクエスト".to_string(),
        };
        println!("メッセージをデータベースに保存準備中: {}", msg_type);

        // DBに保存するMessageオブジェクトを作成
        let db_message = match client_msg {
            ClientMessage::Chat(chat_msg) => DbMessage {
                id: chat_msg.id.clone(),
                timestamp: Utc::now(),
                display_name: chat_msg.display_name.clone(),
                content: chat_msg.content.clone(),
                amount: Some(0.0), // チャットの場合はデフォルト値 0.0 を設定
                coin: None,        // 通常チャットの場合はNone
                tx_hash: None,
                wallet_address: None,
                session_id,
            },
            ClientMessage::Superchat(superchat_msg) => DbMessage {
                id: superchat_msg.id.clone(),
                timestamp: Utc::now(),
                display_name: superchat_msg.display_name.clone(),
                content: superchat_msg.content.clone(),
                amount: Some(superchat_msg.superchat.amount),
                coin: Some(superchat_msg.superchat.coin.clone()),
                tx_hash: Some(superchat_msg.superchat.tx_hash.clone()),
                wallet_address: Some(superchat_msg.superchat.wallet_address.clone()),
                session_id,
            },
            ClientMessage::GetHistory { .. } => {
                // 履歴取得リクエストはDBに保存しない
                println!("履歴取得リクエストはDBに保存しません");
                return;
            }
        };

        // 非同期タスクでDBに保存
        let db_pool_clone = db_pool.clone();
        let message_id = db_message.id.clone(); // エラー報告用にIDをクローン

        tokio::spawn(async move {
            match database::save_message_db(&db_pool_clone, &db_message).await {
                Ok(_) => println!(
                    "メッセージをデータベースに正常に保存しました: ID={}",
                    message_id
                ),
                Err(e) => eprintln!(
                    "メッセージの保存中にエラーが発生しました: ID={}, エラー={}",
                    message_id, e
                ),
            }
        });
    }

    /// ## メッセージをブロードキャストする
    ///
    /// 受信したメッセージを、接続されているすべてのクライアントに送信します。
    /// また、メッセージに追加情報（タイムスタンプ）を付与します。
    ///
    /// ### Arguments
    /// - `client_msg`: ブロードキャストするクライアントメッセージ (`ClientMessage`)
    /// - `ctx`: WebSocketコンテキスト (`&mut ws::WebsocketContext<Self>`)
    fn broadcast_message(&self, client_msg: ClientMessage, ctx: &mut ws::WebsocketContext<Self>) {
        match client_msg {
            ClientMessage::Chat(chat_msg) => {
                // クライアント情報とマネージャーが設定されている場合、メッセージカウンターを更新
                if let (Some(client_info), Some(manager)) =
                    (&self.client_info, &self.connection_manager)
                {
                    manager.update_client(&client_info.id, |info| {
                        info.update_activity();
                        info.increment_messages();
                    });
                }

                let json_result = serde_json::to_string(&chat_msg);

                match json_result {
                    Ok(json) => {
                        // 全クライアントにメッセージをブロードキャスト
                        if let Some(manager) = &self.connection_manager {
                            manager.broadcast(&json);
                        }
                    }
                    Err(e) => {
                        eprintln!("メッセージのシリアライズに失敗: {}", e);
                        ctx.text(
                            self.create_error_response(&format!("メッセージ処理エラー: {}", e)),
                        );
                    }
                }
            }
            ClientMessage::Superchat(superchat_msg) => {
                // クライアント情報とマネージャーが設定されている場合、メッセージカウンターを更新
                if let (Some(client_info), Some(manager)) =
                    (&self.client_info, &self.connection_manager)
                {
                    manager.update_client(&client_info.id, |info| {
                        info.update_activity();
                        info.increment_messages();
                    });
                }

                let json_result = serde_json::to_string(&superchat_msg);

                match json_result {
                    Ok(json) => {
                        // 全クライアントにメッセージをブロードキャスト
                        if let Some(manager) = &self.connection_manager {
                            manager.broadcast(&json);
                        }
                    }
                    Err(e) => {
                        eprintln!("メッセージのシリアライズに失敗: {}", e);
                        ctx.text(
                            self.create_error_response(&format!("メッセージ処理エラー: {}", e)),
                        );
                    }
                }
            }
            ClientMessage::GetHistory { .. } => {
                // 履歴取得リクエストはブロードキャストしない
                println!("履歴取得リクエストはブロードキャストしません");
            }
        }
    }

    /// 履歴取得リクエストを処理する
    ///
    /// クライアントからの過去ログ取得リクエストを処理し、
    /// データベースから該当するメッセージを取得して返します。
    ///
    /// ### Arguments
    /// - `limit`: 取得するメッセージの最大数（オプション、デフォルト50）
    /// - `before_timestamp`: このタイムスタンプより前のメッセージのみを取得（オプション）
    /// - `ctx`: WebSocketコンテキスト
    fn handle_get_history(
        &self,
        limit: Option<i64>,
        before_timestamp: Option<i64>,
        ctx: &mut ws::WebsocketContext<Self>,
    ) {
        // セッションIDを確認
        let session_id = match &self.current_session_id {
            Some(id) => id.clone(),
            None => {
                println!("履歴取得エラー: セッションIDが設定されていません");
                let error_msg = self.create_error_response(
                    "セッションIDが設定されていません。履歴を取得できません。",
                );
                ctx.text(error_msg);
                return;
            }
        };

        // DB接続プールを取得
        let db_pool = {
            let pool_guard = match self.db_pool.lock() {
                Ok(guard) => guard,
                Err(e) => {
                    println!("履歴取得エラー: DBプールのロックに失敗: {}", e);
                    let error_msg = self.create_error_response("データベース接続エラー");
                    ctx.text(error_msg);
                    return;
                }
            };

            match &*pool_guard {
                Some(pool) => pool.clone(),
                None => {
                    println!("履歴取得エラー: DBプールが初期化されていません");
                    let error_msg =
                        self.create_error_response("データベース接続が初期化されていません");
                    ctx.text(error_msg);
                    return;
                }
            }
        };

        // 非同期処理でDBからメッセージを取得
        let safe_limit = limit.unwrap_or(50);
        let session_id_clone = session_id.clone();
        let fut = async move {
            // DBからメッセージを取得
            match crate::database::get_messages_by_session_id(
                &db_pool,
                &session_id_clone,
                safe_limit,
                before_timestamp,
            )
            .await
            {
                Ok(messages) => {
                    // さらに古いメッセージがあるかのフラグ
                    let has_more = messages.len() as i64 > safe_limit;

                    // 実際に返す件数をlimitに制限
                    let limited_messages = if has_more {
                        messages[..messages.len() - 1].to_vec()
                    } else {
                        messages
                    };

                    // DB-Modelを送信用のSerializableMessageに変換
                    let serializable_messages: Vec<crate::types::SerializableMessage> =
                        limited_messages.into_iter().map(|msg| msg.into()).collect();

                    // 長さを先に取得しておく
                    let messages_len = serializable_messages.len();

                    // レスポンスを構築
                    let history_data = crate::types::OutgoingMessage::HistoryData {
                        messages: serializable_messages,
                        has_more,
                    };

                    // JSONに変換
                    match serde_json::to_string(&history_data) {
                        Ok(json) => {
                            println!(
                                "履歴データを送信: {} 件 (has_more: {})",
                                messages_len, has_more
                            );
                            Ok(json)
                        }
                        Err(e) => {
                            println!("履歴データのJSONシリアライズに失敗: {}", e);
                            Err(format!("JSONシリアライズエラー: {}", e))
                        }
                    }
                }
                Err(e) => {
                    println!("履歴取得時のデータベースエラー: {}", e);
                    Err(format!("データベースエラー: {}", e))
                }
            }
        };

        // 非同期処理を実行
        let fut = actix::fut::wrap_future::<_, Self>(fut);

        // 非同期処理の結果を処理
        ctx.spawn(fut.map(|result, _actor, ctx| match result {
            Ok(json) => ctx.text(json),
            Err(e) => {
                let error_response = _actor.create_error_response(&e);
                ctx.text(error_response);
            }
        }));
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

        // AppStateからセッションIDを取得
        if let Some(app_handle) = super::connection_manager::global::get_app_handle() {
            if let Some(app_state) = app_handle.try_state::<AppState>() {
                // セッションIDを取得
                if let Ok(session_id_guard) = app_state.current_session_id.lock() {
                    self.current_session_id = session_id_guard.clone();
                    if let Some(ref session_id) = self.current_session_id {
                        println!("WebSocket Session: Using session ID: {}", session_id);
                    } else {
                        println!("WebSocket Session: No active session ID found");
                    }
                } else {
                    println!("WebSocket Session: Failed to lock current_session_id mutex");
                }
            } else {
                println!("WebSocket Session: AppState not available");
            }
        } else {
            println!("WebSocket Session: app_handle not available");
        }

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
    /// WebSocketメッセージを処理するハンドラーメソッド
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
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
                // JSONメッセージのパース
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(client_msg) => {
                        // メッセージタイプごとに処理
                        match client_msg {
                            // 履歴取得リクエスト
                            ClientMessage::GetHistory {
                                message_type: _,
                                limit,
                                before_timestamp,
                            } => {
                                println!(
                                    "履歴取得リクエストを受信: limit={:?}, before_timestamp={:?}",
                                    limit, before_timestamp
                                );
                                self.handle_get_history(limit, before_timestamp, ctx);
                            }
                            // 既存のチャットとスーパーチャットの処理
                            _ => {
                                // メッセージをDBに保存
                                self.save_message_to_db(&client_msg);

                                // メッセージをブロードキャスト
                                self.broadcast_message(client_msg, ctx);
                            }
                        }
                    }
                    Err(e) => {
                        println!("無効なJSONメッセージを受信: {}", e);
                        let error_response =
                            self.create_error_response(&format!("Invalid message format: {}", e));
                        ctx.text(error_response);
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

    let mut session = WsSession::new()
        .with_connection_manager(manager)
        .with_request(req);

    // AppStateからDB接続プールを取得
    if let Some(app_handle) = app_handle {
        if let Some(app_state) = app_handle.try_state::<AppState>() {
            session = session.with_db_pool(Arc::clone(&app_state.db_pool));
        }
    }

    session
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
