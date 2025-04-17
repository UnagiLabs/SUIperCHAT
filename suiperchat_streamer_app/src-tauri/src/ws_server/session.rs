//! WebSocketセッション管理モジュール
//!
//! WebSocketセッションのライフサイクル管理と、メッセージの処理を行います。

use super::client_info::ClientInfo;
use super::connection_manager::ConnectionManager;
use super::types::{CLIENT_TIMEOUT, HEARTBEAT_INTERVAL};
use crate::types::{ClientMessage, MessageType, ServerResponse};
use actix::prelude::*;
use actix_web::HttpRequest;
use actix_web_actors::ws;
use std::time::Instant;

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

        let json_result = match message {
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
                // メッセージをクライアントに送信
                ctx.text(json);
                // 将来的に: 他の接続されたクライアントにブロードキャスト
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
            // 接続元のIPアドレスを取得
            if let Some(addr) = req.peer_addr() {
                let client_info = ClientInfo::new(addr);
                let client_id = client_info.id.clone();
                println!(
                    "New client connected: {} from {}",
                    client_id, client_info.ip
                );

                // 接続マネージャーに追加
                if let Some(manager) = &self.connection_manager {
                    if manager.add_client(client_info.clone()) {
                        self.client_info = Some(client_info);
                    } else {
                        // 最大接続数に達している場合、切断
                        ctx.text(self.create_error_response(
                            "Maximum connections reached. Try again later.",
                        ));
                        ctx.close(None);
                        ctx.stop();
                        return;
                    }
                } else {
                    // 接続マネージャーがない場合でもClientInfoは設定
                    self.client_info = Some(client_info);
                }
            }
        }

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
    WsSession::new()
        .with_connection_manager(manager)
        .with_request(req)
}
