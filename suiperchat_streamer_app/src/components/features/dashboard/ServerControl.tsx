"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Loader2, Play, StopCircle, Wifi, WifiOff } from "lucide-react";
/**
 * サーバー制御コンポーネント
 *
 * WebSocketサーバーの開始・停止ボタンと状態表示を提供します。
 * TauriのIPCを呼び出してサーバーを制御します。
 * サーバー状態の変更時にイベントを検知し、URL情報を更新します。
 *
 * @module components/features/dashboard/ServerControl
 * @returns {JSX.Element} サーバー制御コンポーネント
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * サーバー制御コンポーネント
 */
export default function ServerControl() {
	const [is_loading, set_is_loading] = useState(false);
	// サーバーの実行状態のみを管理 (起動中: true, 停止中: false)
	const [is_server_running, set_is_server_running] = useState(false);
	// サーバーのアドレス情報 (例: "127.0.0.1:8080")、起動時に設定
	const [server_address, set_server_address] = useState<string | null>(null);
	// TODO: アプリ起動時にサーバーの実際の状態を確認するコマンドを実装・呼び出す
	// useEffect(() => {
	//   const check_initial_status = async () => {
	//      try {
	//          // 例: const status = await invoke<boolean>("is_websocket_server_running");
	//          // set_is_server_running(status);
	//          // if (status) set_server_address("127.0.0.1:8080"); // 仮
	//      } catch (e) { console.error(e); }
	//   };
	//   check_initial_status();
	// }, []);

	/**
	 * サーバーを開始する関数
	 */
	const handle_start_server = async () => {
		set_is_loading(true);
		try {
			// Rust側のコマンド `start_websocket_server` を呼び出す
			await invoke("start_websocket_server");
			set_is_server_running(true);
			set_server_address("127.0.0.1:8080"); // TODO: 動的に取得 or 設定値を使用
			toast.success("Server Started", {
				description: "WebSocket server has started.",
			});
		} catch (error) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			console.error("サーバーの起動に失敗しました:", error_message);
			set_is_server_running(false);
			set_server_address(null);
			toast.error("Server Start Error", {
				description: `Failed to start server: ${error_message}`,
			});
		} finally {
			set_is_loading(false);
		}
	};

	/**
	 * サーバーを停止する関数
	 */
	const handle_stop_server = async () => {
		set_is_loading(true);
		try {
			// Rust側のコマンド `stop_websocket_server` を呼び出す
			await invoke("stop_websocket_server");
			set_is_server_running(false);
			set_server_address(null);
			toast.info("Server Stopped", {
				description: "WebSocket server has been stopped.",
			});
		} catch (error) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			console.error("サーバーの停止に失敗しました:", error_message);
			// 停止失敗の場合でも、UI上は停止として扱う（ハンドルがないため再停止不可）
			set_is_server_running(false);
			set_server_address(null);
			toast.error("Server Stop Error", {
				description: `Failed to stop server: ${error_message}`,
			});
		} finally {
			set_is_loading(false);
		}
	};

	/**
	 * バックエンドからのサーバーステータス更新イベントを処理する関数
	 */
	const handle_server_status_event = useCallback(
		(event: { payload: boolean }) => {
			console.log("Received server_status_updated event:", event);
			const is_running = event.payload;
			set_is_server_running(is_running);

			if (is_running) {
				set_server_address("127.0.0.1:8080"); // TODO: 動的に取得
				toast.success("Server Status Updated to Running", {
					description: "WebSocket server has started.",
				});
			} else {
				set_server_address(null);
				toast.info("Server Status Updated to Stopped", {
					description: "WebSocket server has stopped.",
				});
			}
		},
		[],
	);

	/**
	 * コンポーネントマウント時にイベントリスナーを登録
	 */
	useEffect(() => {
		// サーバーステータス更新イベントをリッスン
		const unlisten = listen<boolean>("server_status_updated", (event) => {
			handle_server_status_event(event);
		});

		// アンマウント時にリスナーをクリーンアップ
		return () => {
			unlisten.then((unlistenFn) => unlistenFn());
		};
	}, [handle_server_status_event]);

	// サーバー状態に基づく表示テキスト
	const status_text = is_server_running ? "Running" : "Stopped";
	const address_text = server_address ?? "-";

	return (
		<Card>
			<CardHeader>
				<CardTitle>Server Control</CardTitle>
				<CardDescription>
					Start and stop the local WebSocket server.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center space-x-4">
					<Button
						onClick={handle_start_server}
						// サーバー実行中、またはローディング中は無効
						disabled={is_loading || is_server_running}
					>
						{is_loading && !is_server_running ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Play className="mr-2 h-4 w-4" />
						)}
						Start
					</Button>
					<Button
						variant="destructive"
						onClick={handle_stop_server}
						// サーバー停止中、またはローディング中は無効
						disabled={is_loading || !is_server_running}
					>
						{is_loading && is_server_running ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<StopCircle className="mr-2 h-4 w-4" />
						)}
						Stop
					</Button>
				</div>
				<div className="flex items-center space-x-2 text-sm">
					{is_server_running ? (
						<Wifi className="h-5 w-5 text-green-500" />
					) : (
						<WifiOff className="h-5 w-5 text-red-500" />
					)}
					<span>Status: {status_text}</span>
					<span className="text-muted-foreground">({address_text})</span>
				</div>
				{/* エラーなどの詳細メッセージ表示エリア (必要であれば追加) */}
				{/* <p className="text-sm text-muted-foreground">{display_message}</p> */}
			</CardContent>
		</Card>
	);
}
