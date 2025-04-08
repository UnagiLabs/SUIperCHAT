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
import { useState } from "react";
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
	const [server_status, set_server_status] =
		useState<ServerStatusResponse | null>(null);

	// TODO: コンポーネントマウント時に現在のサーバー状態を取得するIPC呼び出しを追加
	// useEffect(() => {
	//   const fetch_status = async () => {
	//     try {
	//       const status = await invoke<ServerStatusResponse>("get_server_status");
	//       set_server_status(status);
	//     } catch (error) {
	//       console.error("サーバー状態の取得に失敗しました:", error);
	//     }
	//   };
	//   fetch_status();
	// }, []);

	/**
	 * サーバーを開始する関数
	 */
	const handle_start_server = async () => {
		set_is_loading(true);
		try {
			// TODO: ポート番号やホスト名をユーザーが設定できるようにする
			const response = await invoke<ServerStatusResponse>("start_server", {
				port: 8080,
			});
			set_server_status(response);
			toast(response.is_running ? "サーバー起動成功" : "サーバー起動失敗", {
				description: response.message,
			});
		} catch (error) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			console.error("サーバーの起動に失敗しました:", error);
			set_server_status({
				is_running: false,
				port: null,
				host: null,
				message: `起動エラー: ${error_message}`,
			});
			toast.error("サーバー起動エラー", {
				description: `サーバーの起動中にエラーが発生しました: ${error_message}`,
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
			const response = await invoke<ServerStatusResponse>("stop_server");
			set_server_status(response);
			toast("サーバー停止", {
				description: response.message,
			});
		} catch (error) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			console.error("サーバーの停止に失敗しました:", error);
			// 停止失敗時でも状態は停止として扱うことが多いが、UI上はエラーを示す
			set_server_status({
				is_running: false,
				port: null,
				host: null,
				message: `停止エラー: ${error_message}`,
			});
			toast.error("サーバー停止エラー", {
				description: `サーバーの停止中にエラーが発生しました: ${error_message}`,
			});
		} finally {
			set_is_loading(false);
		}
	};

	// 現在のサーバー状態に基づいて表示を決定
	const is_running = server_status?.is_running ?? false;
	const display_message =
		server_status?.message ?? "サーバーの状態は不明です。";
	const display_address =
		is_running && server_status?.host && server_status?.port
			? `${server_status.host}:${server_status.port}`
			: "-";

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
						disabled={is_loading || is_running}
					>
						{is_loading && !is_running ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Play className="mr-2 h-4 w-4" />
						)}
						開始
					</Button>
					<Button
						variant="destructive"
						onClick={handle_stop_server}
						disabled={is_loading || !is_running}
					>
						{is_loading && is_running ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<StopCircle className="mr-2 h-4 w-4" />
						)}
						停止
					</Button>
				</div>
				<div className="flex items-center space-x-2 text-sm">
					{is_running ? (
						<Wifi className="h-5 w-5 text-green-500" />
					) : (
						<WifiOff className="h-5 w-5 text-red-500" />
					)}
					<span>状態: {is_running ? "実行中" : "停止中"}</span>
					<span className="text-muted-foreground">({display_address})</span>
				</div>
				<p className="text-sm text-muted-foreground">{display_message}</p>
			</CardContent>
		</Card>
	);
}
