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
import { Loader2, Play, StopCircle, Wifi, WifiOff } from "lucide-react";
/**
 * サーバー制御コンポーネント
 *
 * WebSocketサーバーの開始・停止ボタンと状態表示を提供します。
 * TauriのIPCを呼び出してサーバーを制御します。
 *
 * @module components/features/dashboard/ServerControl
 * @returns {JSX.Element} サーバー制御コンポーネント
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Rust側からのサーバー状態レスポンスの型定義
 *
 * @interface ServerStatusResponse
 * @property {boolean} is_running - サーバーが実行中かどうか
 * @property {number | null} port - サーバーのポート番号 (実行中の場合)
 * @property {string | null} host - サーバーのホスト名 (実行中の場合)
 * @property {string} message - 状態メッセージ
 */
interface ServerStatusResponse {
	is_running: boolean;
	port: number | null;
	host: string | null;
	message: string;
}

/**
 * サーバー制御コンポーネント
 * @returns {JSX.Element} コンポーネント
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
			toast.success("サーバー起動成功", {
				description: "WebSocket サーバーが起動しました。",
			});
		} catch (error) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			console.error("サーバーの起動に失敗しました:", error_message);
			set_is_server_running(false);
			set_server_address(null);
			toast.error("サーバー起動エラー", {
				description: `サーバーの起動に失敗しました: ${error_message}`,
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
			toast.info("サーバー停止", {
				description: "WebSocket サーバーを停止しました。",
			});
		} catch (error) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			console.error("サーバーの停止に失敗しました:", error_message);
			// 停止失敗の場合でも、UI上は停止として扱う（ハンドルがないため再停止不可）
			set_is_server_running(false);
			set_server_address(null);
			toast.error("サーバー停止エラー", {
				description: `サーバーの停止に失敗しました: ${error_message}`,
			});
		} finally {
			set_is_loading(false);
		}
	};

	// サーバー状態に基づく表示テキスト
	const status_text = is_server_running ? "実行中" : "停止中";
	const address_text = server_address ?? "-";

	return (
		<Card>
			<CardHeader>
				<CardTitle>サーバー制御</CardTitle>
				<CardDescription>
					ローカルWebSocketサーバーを開始・停止します。
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
						開始
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
						停止
					</Button>
				</div>
				<div className="flex items-center space-x-2 text-sm">
					{is_server_running ? (
						<Wifi className="h-5 w-5 text-green-500" />
					) : (
						<WifiOff className="h-5 w-5 text-red-500" />
					)}
					<span>状態: {status_text}</span>
					<span className="text-muted-foreground">({address_text})</span>
				</div>
				{/* エラーなどの詳細メッセージ表示エリア (必要であれば追加) */}
				{/* <p className="text-sm text-muted-foreground">{display_message}</p> */}
			</CardContent>
		</Card>
	);
}
