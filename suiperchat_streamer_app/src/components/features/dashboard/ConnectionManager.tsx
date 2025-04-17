/**
 * WebSocket接続管理コンポーネント
 *
 * WebSocketサーバーの接続状況を表示し、接続管理機能を提供します。
 * - 現在の接続数と最大接続数の表示
 * - 最大接続数の設定
 *
 * @module components/features/dashboard/ConnectionManager
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReloadIcon } from "@radix-ui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * クライアント情報の型定義
 */
interface ClientInfo {
	id: string;
	ip: string;
	connected_at: string;
	last_active: string;
	messages_sent: number;
}

/**
 * 接続情報の型定義
 */
interface ConnectionsInfo {
	active_connections: number;
	max_connections: number;
	clients: ClientInfo[];
}

/**
 * WebSocket接続管理コンポーネント
 *
 * @returns {React.ReactNode} 接続管理UIのレンダリング結果
 */
export default function ConnectionManager() {
	// 接続情報の状態
	const [connectionsInfo, setConnectionsInfo] =
		useState<ConnectionsInfo | null>(null);
	// 接続情報取得中の状態
	const [loading, setLoading] = useState<boolean>(true);
	// エラー状態
	const [error, setError] = useState<string | null>(null);
	// 最大接続数の入力値
	const [maxConnectionsInput, setMaxConnectionsInput] = useState<string>("");
	// リフレッシュボタンの無効化状態
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

	/**
	 * 接続情報を取得する関数
	 *
	 * @param {boolean} showToast - エラー時にトーストを表示するかどうか
	 */
	const fetchConnectionsInfo = useCallback(
		async (showToast = true) => {
			// すでに処理中の場合は何もしない
			if (isRefreshing) return;

			try {
				setLoading(true);
				setIsRefreshing(true);

				// タイムアウト処理を追加
				const timeoutPromise = new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error("Request timed out")), 5000);
				});

				// Tauriコマンドと競合させる
				const info = await Promise.race([
					invoke<ConnectionsInfo>("get_connections_info"),
					timeoutPromise,
				]);

				setConnectionsInfo(info);
				setMaxConnectionsInput(info.max_connections.toString());
				setError(null);
			} catch (err) {
				console.error("Failed to fetch connection info:", err);
				const errorMessage = err instanceof Error ? err.message : String(err);
				setError(`Failed to fetch connection info: ${errorMessage}`);

				if (showToast) {
					if (errorMessage.includes("timed out")) {
						toast.error(
							"Connection info request timed out. Please try again later.",
						);
					} else {
						toast.error("Failed to fetch connection info");
					}
				}
			} finally {
				setLoading(false);
				setIsRefreshing(false);
			}
		},
		[isRefreshing],
	);

	/**
	 * 最大接続数を設定する関数
	 */
	const setMaxConnections = async () => {
		const maxConnections = Number.parseInt(maxConnectionsInput, 10);
		if (Number.isNaN(maxConnections) || maxConnections < 1) {
			toast.error("Maximum connections must be a number greater than 0");
			return;
		}

		try {
			await invoke("set_connection_limits", { maxConnections });
			toast.success(`Maximum connections set to ${maxConnections}`);
			// 接続情報を更新
			fetchConnectionsInfo();
		} catch (err) {
			console.error("Failed to set maximum connections:", err);
			toast.error(`Failed to set maximum connections: ${err}`);
		}
	};

	// コンポーネントマウント時に接続情報を取得
	useEffect(() => {
		// 初回ロード時はトーストを表示しない
		fetchConnectionsInfo(false);

		// 接続情報更新イベントをリッスン
		const unlisten = listen("connections_updated", (event) => {
			console.log("Connection update event received:", event);
			setConnectionsInfo(event.payload as ConnectionsInfo);
		});

		// コンポーネント解除時にイベントリスナーを解除
		return () => {
			unlisten.then((unlistenFn) => unlistenFn());
		};
	}, [fetchConnectionsInfo]);

	/**
	 * リフレッシュボタンのクリックハンドラ
	 */
	const handleRefresh = () => {
		if (!isRefreshing) {
			fetchConnectionsInfo(true);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Connection Manager</CardTitle>
				<CardDescription>Manage WebSocket server connections</CardDescription>
			</CardHeader>
			<CardContent>
				{loading && !connectionsInfo ? (
					<div className="flex justify-center items-center p-4">
						<ReloadIcon className="mr-2 h-4 w-4 animate-spin" /> Loading
						connection information...
					</div>
				) : error ? (
					<div className="text-red-500 p-4">{error}</div>
				) : connectionsInfo ? (
					<>
						<div className="flex justify-between items-center mb-4">
							<div className="space-y-1">
								<div className="text-sm font-medium">Connection Status</div>
								<div className="flex space-x-2">
									<Badge variant="outline">
										Active connections: {connectionsInfo.active_connections} /{" "}
										{connectionsInfo.max_connections}
									</Badge>
								</div>
							</div>
							<Button
								size="sm"
								variant="outline"
								onClick={handleRefresh}
								disabled={isRefreshing}
								className="flex items-center"
							>
								<ReloadIcon
									className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
								/>
								{isRefreshing ? "Refreshing..." : "Refresh"}
							</Button>
						</div>

						<div className="space-y-4">
							<div className="grid grid-cols-3 gap-4 items-end">
								<div className="space-y-2 col-span-2">
									<Label htmlFor="max-connections">Maximum Connections</Label>
									<Input
										id="max-connections"
										type="number"
										min="1"
										value={maxConnectionsInput}
										onChange={(e) => setMaxConnectionsInput(e.target.value)}
										placeholder="Enter maximum connections"
									/>
								</div>
								<Button onClick={setMaxConnections}>Apply</Button>
							</div>
						</div>
					</>
				) : null}
			</CardContent>
			<CardFooter className="flex justify-between">
				<div className="text-xs text-muted-foreground">
					Connections are automatically managed while the server is running
				</div>
			</CardFooter>
		</Card>
	);
}
