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
/**
 * バックエンドから送信されるServerStatusイベントのペイロード型
 */
interface ServerStatusPayload {
	is_running: boolean;
	obs_url?: string | null; // バックエンドではOption<String>なのでnullの可能性あり
	ws_url?: string | null; // バックエンドではOption<String>なのでnullの可能性あり
}

export default function ServerControl() {
	const [is_loading, set_is_loading] = useState(false);
	const [is_server_running, set_is_server_running] = useState(false);
	const [ws_server_address, set_ws_server_address] = useState<string | null>(
		null,
	);
	const [obs_server_address, set_obs_server_address] = useState<string | null>(
		null,
	);
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
			// ウォレットアドレスの存在チェック
			const wallet_info = await invoke<{ wallet_address: string | null }>(
				"get_wallet_address",
			);

			// YouTube動画IDの存在チェック
			const youtube_info = await invoke<{ youtube_video_id: string | null }>(
				"get_youtube_video_id",
			);

			// 両方の設定が揃っているか確認
			const wallet_address_set = !!wallet_info.wallet_address;
			const youtube_id_set = !!youtube_info.youtube_video_id;

			if (!wallet_address_set || !youtube_id_set) {
				const missing_config = [];
				if (!wallet_address_set) missing_config.push("Wallet Address");
				if (!youtube_id_set) missing_config.push("YouTube URL");

				toast.info("Configuration Required", {
					description: `Please set your ${missing_config.join(" and ")} in the Streamer Configuration section before starting the server.`,
				});
				return;
			}

			// 両方の設定が存在する場合のみサーバー起動コマンドを呼び出す
			await invoke("start_websocket_server");
			// 状態更新はイベントリスナーに任せる
			// toast通知もイベントリスナー側で行う
		} catch (error) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			console.error(
				"サーバーの起動コマンド呼び出しに失敗しました:",
				error_message,
			);

			// エラーメッセージの内容に関わらず、一般的なエラーメッセージを表示
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
			// 状態更新はイベントリスナーに任せる
			await invoke("stop_websocket_server");
			// ここでの状態更新は削除
			// toast通知もイベントリスナー側で行う
		} catch (error) {
			const error_message =
				error instanceof Error ? error.message : String(error);
			console.error(
				"サーバーの停止コマンド呼び出しに失敗しました:",
				error_message,
			);
			// 状態はイベント経由で更新されるはずだが、念のためローディング解除
			// toast通知もイベントリスナー側で行う
			toast.error("Server Stop Command Error", {
				description: `Failed to invoke stop command: ${error_message}`,
			});
		} finally {
			set_is_loading(false);
		}
	};

	/**
	 * バックエンドからのサーバーステータス更新イベントを処理する関数
	 */
	const handle_server_status_event = useCallback(
		(event: {
			payload: ServerStatusPayload;
		}) => {
			console.log("Received server_status_updated event:", event.payload);
			const { is_running, obs_url, ws_url } = event.payload;

			set_is_server_running(is_running);
			set_obs_server_address(obs_url ?? null); // nullish coalescing で null にする
			set_ws_server_address(ws_url ?? null); // nullish coalescing で null にする

			if (is_running) {
				toast.success("Server Status: Running", {
					description: `OBS: ${obs_url || "N/A"}, WS: ${ws_url || "N/A"}`,
				});
			} else {
				toast.info("Server Status: Stopped", {
					description: "WebSocket and OBS servers have stopped.",
				});
			}
		},
		[],
	);

	/**
	 * コンポーネントマウント時にイベントリスナーを登録
	 */
	useEffect(() => {
		// サーバーステータス更新イベントをリッスン (型パラメータを修正)
		const unlisten = listen<ServerStatusPayload>(
			"server_status_updated",
			(event) => {
				handle_server_status_event(event);
			},
		);

		// アンマウント時にリスナーをクリーンアップ
		return () => {
			unlisten.then((unlistenFn) => unlistenFn());
		};
	}, [handle_server_status_event]);

	// サーバー状態に基づく表示テキスト (動的URLを表示)
	const status_text = is_server_running ? "Running" : "Stopped";
	const ws_display_text = ws_server_address || "N/A";
	const obs_display_text = obs_server_address || "N/A";
	const address_text = is_server_running
		? `WS: ${ws_display_text}, OBS: ${obs_display_text}`
		: "-";

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
