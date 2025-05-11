/**
 * Tauri IPC通信ユーティリティ
 *
 * フロントエンドからTauriのRustバックエンドを呼び出すための
 * ユーティリティ関数を提供します。
 *
 * @module lib/tauriUtils
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * Tauriのグリーティングレスポンスの型定義
 */
interface GreetingResponse {
	message: string;
	timestamp: number; // Rust の u64 は TypeScript の number に対応
}

/**
 * 指定された名前を使用して挨拶メッセージを取得します。
 *
 * @param {string} name - 挨拶する相手の名前。
 * @returns {Promise<GreetingResponse>} 挨拶メッセージとタイムスタンプを含む Promise オブジェクト。
 * @throws {Error} 挨拶メッセージの取得に失敗した場合にエラーをスローします。
 */
export async function get_greeting_message(
	name: string,
): Promise<GreetingResponse> {
	// バックエンドの greet コマンドは request: { name: string } という形式の引数を期待している
	try {
		// invoke<T> で戻り値の型を指定
		return await invoke<GreetingResponse>("greet", { request: { name } });
	} catch (error) {
		console.error("挨拶の取得に失敗しました:", error);
		// エラーオブジェクトをそのままスローするか、より具体的なエラーメッセージを作成
		if (error instanceof Error) {
			throw new Error(`Failed to get greeting: ${error.message}`);
		}
		// 上のif文で throw new Error しているので、else は不要
		throw new Error(
			`Failed to get greeting: Unknown error occurred ${String(error)}`,
		);
	}
}

/**
 * アプリケーションのバージョン情報を取得
 *
 * @returns {Promise<{version: string, build_id: string, build_date: string}>} バージョン情報
 */
export async function getAppVersion(): Promise<{
	version: string;
	build_id: string;
	build_date: string;
}> {
	try {
		return await invoke("get_app_version");
	} catch (error) {
		console.error("バージョン情報の取得に失敗しました:", error);
		throw new Error(`Failed to get version information: ${error}`);
	}
}
