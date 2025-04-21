//! # データベースモデル定義
//!
//! このモジュールは、SQLiteデータベースのテーブル構造に対応するRust構造体を定義します。
//! Prismaスキーマと互換性のあるモデルを提供し、`sqlx`を使用してデータベース操作を行います。

use chrono::{DateTime, Utc};
use sqlx::FromRow;

/// ## メッセージモデル
///
/// スーパーチャットメッセージや通常メッセージの情報を格納します。
///
/// ### フィールド
/// * `id` - メッセージの一意な識別子 (主キー)
/// * `session_id` - 関連する配信セッションのID (外部キー)
/// * `wallet_address` - 送信者のSUIウォレットアドレス (スパチャの場合必須、通常メッセージはNULL)
/// * `display_name` - 視聴者が入力した表示名
/// * `message` - メッセージ内容
/// * `amount` - スパチャ金額 (SUI単位、スパチャなしは0)
/// * `tx_hash` - SUIトランザクションハッシュ (スパチャの場合必須、通常メッセージはNULL)
/// * `timestamp` - メッセージ受信日時
#[derive(FromRow, Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Message {
    pub id: i32,
    pub session_id: i32,
    pub wallet_address: Option<String>,
    pub display_name: String,
    pub message: String,
    pub amount: f64,
    pub tx_hash: Option<String>,
    pub timestamp: DateTime<Utc>,
}

/// ## セッションモデル
///
/// 配信セッションの情報を格納します。
///
/// ### フィールド
/// * `id` - セッションの一意な識別子 (主キー)
/// * `start_time` - セッション開始日時
/// * `end_time` - セッション終了日時 (NULLの場合は配信中)
/// * `created_at` - レコード作成日時
/// * `updated_at` - レコード更新日時
#[derive(FromRow, Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Session {
    pub id: i32,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
