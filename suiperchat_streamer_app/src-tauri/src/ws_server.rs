#![allow(clippy::future_not_send)] // Actix actors are not necessarily Send

use crate::types::{ClientMessage, MessageType, ServerResponse};
use actix::prelude::*;
use actix_web_actors::ws;
use std::time::{Duration, Instant};

/// WebSocket アクター (`WsSession`) の設定値
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

/// ## WsSession アクター
///
/// 各 WebSocket クライアント接続を管理するアクター。
/// ハートビートを送信し、クライアントからの応答を監視します。
/// 受信したメッセージを処理します。
#[derive(Debug)]
pub struct WsSession {
    /// クライアントからの最後のハートビート受信時刻
    hb: Instant,
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
        Self { hb: Instant::now() }
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
