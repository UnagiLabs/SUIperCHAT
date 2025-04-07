/**
 * Tauri IPC通信ユーティリティ
 *
 * フロントエンドからTauriのRustバックエンドを呼び出すための
 * ユーティリティ関数を提供します。
 *
 * @module lib/utils/tauri
 */

import { invoke } from "@tauri-apps/api/core";
// import { type AppInfo } from "@/types/app-info"; // 未使用のためコメントアウト

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
			throw new Error(`挨拶の取得に失敗しました: ${error.message}`);
		}
		// 上のif文で throw new Error しているので、else は不要
		throw new Error(
			`挨拶の取得に失敗しました: 不明なエラーが発生しました ${String(error)}`,
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
		throw new Error(`バージョン情報の取得に失敗しました: ${error}`);
	}
}

/**
 * WebSocketサーバーを起動
 *
 * @param {Object} options - サーバー起動オプション
 * @param {number} [options.port=8080] - サーバーポート
 * @param {string} [options.host='localhost'] - サーバーホスト
 * @returns {Promise<{is_running: boolean, port?: number, host?: string, message: string}>} サーバー状態
 */
export async function startServer(options?: {
	port?: number;
	host?: string;
}): Promise<{
	is_running: boolean;
	port?: number;
	host?: string;
	message: string;
}> {
	try {
		// バックエンドの start_server コマンドは request キーを期待している
		return await invoke("start_server", { request: options || {} });
	} catch (error) {
		console.error("サーバーの起動に失敗しました:", error);
		if (error instanceof Error) {
			throw new Error(`サーバーの起動に失敗しました: ${error.message}`);
		}
		throw new Error(
			`サーバーの起動に失敗しました: 不明なエラーが発生しました ${String(error)}`,
		);
	}
}

/**
 * WebSocketサーバーを停止
 *
 * @returns {Promise<{is_running: boolean, message: string}>} サーバー状態
 */
export async function stopServer(): Promise<{
	is_running: boolean;
	message: string;
}> {
	try {
		// バックエンドの stop_server コマンドも request キーを期待している可能性があるため修正
		return await invoke("stop_server", { request: {} });
	} catch (error) {
		console.error("サーバーの停止に失敗しました:", error);
		if (error instanceof Error) {
			throw new Error(`サーバーの停止に失敗しました: ${error.message}`);
		}
		throw new Error(
			`サーバーの停止に失敗しました: 不明なエラーが発生しました ${String(error)}`,
		);
	}
}
