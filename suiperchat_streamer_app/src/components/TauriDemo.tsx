/**
 * Tauri IPC通信デモコンポーネント
 *
 * Rustバックエンドとの通信を示す簡単なデモを提供します。
 * 名前の入力と挨拶メッセージの表示、WebSocketサーバーの制御を行います。
 *
 * @module components/TauriDemo
 */

"use client";

import {
	getAppVersion,
	get_greeting_message,
	startServer,
	stopServer,
} from "@/lib/utils/tauri";
import React, { useState, useEffect } from "react";

/**
 * Tauri IPC通信のデモを表示するコンポーネント
 *
 * @returns {React.ReactNode} レンダリング結果
 */
export default function TauriDemo() {
	// 各種状態管理
	const [name, set_name] = useState<string>("");
	const [greeting_response, set_greeting_response] = useState<string>("");
	const [version_info, set_version_info] = useState<{
		version: string;
		build_id: string;
		build_date: string;
	} | null>(null);
	const [server_status, set_server_status] = useState<{
		is_running: boolean;
		port?: number;
		host?: string;
		message: string;
	} | null>(null);
	const [loading, set_loading] = useState<{
		greet: boolean;
		version: boolean;
		server: boolean;
	}>({
		greet: false,
		version: false,
		server: false,
	});
	const [error, set_error] = useState<string | null>(null);

	// コンポーネントマウント時にバージョン情報を取得
	useEffect(() => {
		fetchVersionInfo();
	}, []);

	/**
	 * バージョン情報の取得
	 */
	const fetchVersionInfo = async () => {
		try {
			set_loading((prev) => ({ ...prev, version: true }));
			const version_data = await getAppVersion();
			set_version_info(version_data);
			set_error(null);
		} catch (err) {
			set_error(`バージョン情報の取得に失敗しました: ${err}`);
			console.error(err);
		} finally {
			set_loading((prev) => ({ ...prev, version: false }));
		}
	};

	/**
	 * 挨拶メッセージを送信するハンドラー関数
	 */
	const handle_submit_greeting = async () => {
		if (!name) {
			set_error("名前を入力してください");
			return;
		}
		set_error("");
		set_greeting_response("");
		set_loading((prev) => ({ ...prev, greet: true }));
		try {
			// get_greeting_message を呼び出し、レスポンスを取得
			const response = await get_greeting_message(name);
			// レスポンスオブジェクトから message プロパティを取得してセット
			set_greeting_response(response.message);
		} catch (err) {
			// エラーメッセージを設定（errがErrorインスタンスか確認）
			set_error(
				`挨拶の取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			// ローディング状態を解除
			set_loading((prev) => ({ ...prev, greet: false }));
		}
	};

	/**
	 * サーバーの起動
	 */
	const handleStartServer = async () => {
		try {
			set_loading((prev) => ({ ...prev, server: true }));
			const status = await startServer({ port: 8080 });
			set_server_status(status);
			set_error(null);
		} catch (err) {
			set_error(`サーバーの起動に失敗しました: ${err}`);
			console.error(err);
		} finally {
			set_loading((prev) => ({ ...prev, server: false }));
		}
	};

	/**
	 * サーバーの停止
	 */
	const handleStopServer = async () => {
		try {
			set_loading((prev) => ({ ...prev, server: true }));
			const status = await stopServer();
			set_server_status(status);
			set_error(null);
		} catch (err) {
			set_error(`サーバーの停止に失敗しました: ${err}`);
			console.error(err);
		} finally {
			set_loading((prev) => ({ ...prev, server: false }));
		}
	};

	return (
		<div className="space-y-6">
			{/* エラーメッセージ */}
			{error && (
				<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative dark:bg-red-900 dark:text-red-100 dark:border-red-800">
					{error}
				</div>
			)}

			{/* バージョン情報 */}
			<div className="mb-4">
				<h3 className="text-md font-medium mb-2">アプリ情報</h3>
				{loading.version ? (
					<p>読み込み中...</p>
				) : version_info ? (
					<div className="text-sm">
						<p>バージョン: {version_info.version}</p>
						<p>ビルドID: {version_info.build_id}</p>
						<p>
							ビルド日時: {new Date(version_info.build_date).toLocaleString()}
						</p>
					</div>
				) : (
					<p className="text-sm text-gray-500">
						バージョン情報の取得に失敗しました
					</p>
				)}
			</div>

			{/* 挨拶メッセージ */}
			<div className="mb-4">
				<h3 className="text-md font-medium mb-2">挨拶メッセージ</h3>
				<div className="flex gap-2 mb-2">
					<input
						type="text"
						value={name}
						onChange={(e) => set_name(e.target.value)}
						placeholder="あなたの名前"
						className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm dark:bg-gray-700 dark:border-gray-600"
					/>
					<button
						type="button"
						onClick={handle_submit_greeting}
						disabled={loading.greet}
						className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
					>
						{loading.greet ? "送信中..." : "送信"}
					</button>
				</div>
				{/* 挨拶メッセージ表示エリア */}
				{greeting_response && (
					<div className="mt-4 rounded bg-blue-100 p-4 text-blue-700">
						{greeting_response}
					</div>
				)}
			</div>

			{/* サーバー制御 */}
			<div>
				<h3 className="text-md font-medium mb-2">WebSocketサーバー</h3>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={handleStartServer}
						disabled={loading.server || server_status?.is_running === true}
						className="px-4 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
					>
						サーバー起動
					</button>
					<button
						type="button"
						onClick={handleStopServer}
						disabled={loading.server || server_status?.is_running === false}
						className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50"
					>
						サーバー停止
					</button>
				</div>
				{server_status && (
					<div
						className={`mt-2 p-3 rounded text-sm ${
							server_status.is_running
								? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
								: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
						}`}
					>
						<p>
							<strong>状態:</strong>{" "}
							{server_status.is_running ? "実行中" : "停止"}
						</p>
						{server_status.port && (
							<p>
								<strong>ポート:</strong> {server_status.port}
							</p>
						)}
						{server_status.host && (
							<p>
								<strong>ホスト:</strong> {server_status.host}
							</p>
						)}
						<p>
							<strong>メッセージ:</strong> {server_status.message}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
