//! データベースモデル定義モジュール
//!
//! SQLiteデータベースのテーブル構造に対応するRustの構造体と関連機能を定義する

use chrono::{DateTime, Utc};
use sqlx::FromRow;

/// メッセージ情報を表す構造体
///
/// チャットメッセージまたはスーパーチャットの情報を保持する
///
/// # フィールド
/// * `id` - メッセージの一意識別子
/// * `timestamp` - メッセージが送信された時刻
/// * `display_name` - 送信者の表示名
/// * `content` - メッセージの内容
/// * `amount` - スーパーチャットの金額（通常のチャットはNone）
/// * `coin` - 使用されたコインの通貨シンボル（"SUI", "USDC"など、通常のチャットはNone）
/// * `tx_hash` - トランザクションハッシュ（スーパーチャット時）
/// * `wallet_address` - 送信者のウォレットアドレス（スーパーチャット時）
/// * `session_id` - 配信セッションの識別子
#[derive(FromRow, Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Message {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub display_name: String,
    #[sqlx(rename = "message")]
    pub content: String,
    // Prisma Float は f64 にマッピング
    pub amount: Option<f64>,  // スパチャでない場合は NULL
    pub coin: Option<String>, // 使用されたコインのシンボル
    pub tx_hash: Option<String>,
    pub wallet_address: Option<String>,
    pub session_id: Option<String>, // どの配信セッションのメッセージかを示すID
}

/// 配信セッション情報を表す構造体
///
/// 一回の配信（WebSocketサーバー起動から停止まで）の情報を保持する
///
/// # フィールド
/// * `id` - セッションの一意識別子（UUID）
/// * `started_at` - セッション開始時刻（ISO 8601形式の文字列）
/// * `ended_at` - セッション終了時刻（ISO 8601形式の文字列、セッション中はNone）
/// * `created_at` - レコード作成時刻（ISO 8601形式の文字列）
/// * `updated_at` - レコード更新時刻（ISO 8601形式の文字列）
#[derive(FromRow, Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Session {
    pub id: String,               // UUID
    pub started_at: String,       // ISO 8601形式の文字列
    pub ended_at: Option<String>, // ISO 8601形式の文字列
    pub created_at: String,       // ISO 8601形式の文字列
    pub updated_at: String,       // ISO 8601形式の文字列
}
