/**
 * コメント関連の型定義
 *
 * コメント表示機能で使用する型を定義します。
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * スーパーチャットの詳細情報
 */
export interface FormattedSuperchatData {
	/** 送金額 */
	amount?: number;
	/** 使用されたコインの種類 */
	coin?: string;
	/** トランザクションハッシュ */
	tx_hash?: string;
}

/**
 * フロントエンド表示用に整形されたコメント情報
 */
export interface FormattedComment {
	/** コメントの一意識別子 */
	id: string;
	/** セッションID */
	session_id: string;
	/** メッセージタイプ (通常チャットかスーパーチャットか) */
	message_type: "CHAT" | "SUPERCHAT";
	/** 送信者の表示名 */
	name: string;
	/** メッセージ内容 */
	message: string;
	/** タイムスタンプ (Unixミリ秒) */
	timestamp: number;
	/** スーパーチャットの場合の詳細情報 */
	superchat?: FormattedSuperchatData;
}

/**
 * セッション情報
 */
export interface SessionInfo {
	/** セッションID */
	id: string;
	/** セッション開始日時（ISO 8601形式の文字列） */
	started_at: string;
	/** セッション終了日時（ISO 8601形式の文字列、終了していない場合はnull） */
	ended_at: string | null;
}
