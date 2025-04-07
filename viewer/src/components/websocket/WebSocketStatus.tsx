"use client";

/**
 * WebSocket接続状態表示コンポーネント
 *
 * WebSocketの接続状態をUIに表示するためのコンポーネントです。
 * 開発・テスト用として使用します。
 *
 * @module components/websocket/WebSocketStatus
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWebSocketConnect } from "@/hooks/useWebSocketConnect";
import { ConnectionStatus } from "@/lib/types/websocket";
import { AlertCircle } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

/**
 * WebSocket接続状態の色とテキストのマッピング
 */
const statusConfig = {
	[ConnectionStatus.CONNECTED]: {
		color: "bg-green-500 dark:bg-green-600",
		text: "接続済み",
	},
	[ConnectionStatus.CONNECTING]: {
		color: "bg-yellow-500 dark:bg-yellow-600",
		text: "接続中...",
	},
	[ConnectionStatus.DISCONNECTED]: {
		color: "bg-slate-500 dark:bg-slate-600",
		text: "切断済み",
	},
	[ConnectionStatus.DISCONNECTING]: {
		color: "bg-slate-500 dark:bg-slate-600",
		text: "切断中...",
	},
	[ConnectionStatus.RECONNECTING]: {
		color: "bg-orange-500 dark:bg-orange-600",
		text: "再接続中...",
	},
	[ConnectionStatus.ERROR]: {
		color: "bg-red-500 dark:bg-red-600",
		text: "エラー",
	},
};

/**
 * WebSocket接続状態表示コンポーネントのプロパティ
 */
interface WebSocketStatusProps {
	/**
	 * 初期WebSocket URL
	 * @default "ws://localhost:8080"
	 */
	defaultUrl?: string;
}

/**
 * WebSocket接続状態表示コンポーネント
 *
 * @param {WebSocketStatusProps} props - コンポーネントプロパティ
 * @returns {JSX.Element} WebSocket接続状態表示コンポーネント
 */
export function WebSocketStatus({
	defaultUrl = "ws://localhost:8080",
}: WebSocketStatusProps): React.ReactElement {
	const [url, setUrl] = useState(defaultUrl);
	const [manualConnect, setManualConnect] = useState(false);

	const { status, isConnected, error, retryCount, connect, disconnect } =
		useWebSocketConnect({
			autoConnect: false,
			url: manualConnect ? url : undefined,
		});

	// マニュアル接続モードが変更された場合の処理
	useEffect(() => {
		if (!manualConnect) {
			disconnect();
		}
	}, [disconnect, manualConnect]);

	/**
	 * 接続ボタンのクリックハンドラ
	 */
	const handleConnect = () => {
		setManualConnect(true);
		connect(url);
	};

	/**
	 * 切断ボタンのクリックハンドラ
	 */
	const handleDisconnect = () => {
		setManualConnect(false);
		disconnect();
	};

	// 現在の状態に基づく表示設定
	const { color, text } = statusConfig[status];

	return (
		<div className="p-4 border rounded-lg shadow-sm dark:border-gray-700">
			<h3 className="text-lg font-medium mb-3">WebSocket接続状態</h3>

			<div className="flex items-center gap-2 mb-3">
				<Badge className={`${color} text-white font-medium`}>{text}</Badge>

				{retryCount > 0 && (
					<span className="text-xs text-gray-500 dark:text-gray-400">
						再試行: {retryCount}回
					</span>
				)}
			</div>

			{error && (
				<Alert variant="destructive" className="mb-3">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="flex flex-col gap-2 mt-3">
				<div className="flex gap-2">
					<Input
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="WebSocket URL"
						className="flex-grow dark:bg-gray-800"
					/>

					{isConnected ? (
						<Button
							onClick={handleDisconnect}
							variant="destructive"
							className="px-4"
						>
							切断
						</Button>
					) : (
						<Button onClick={handleConnect} variant="default" className="px-4">
							接続
						</Button>
					)}
				</div>

				<div className="text-xs text-gray-500 dark:text-gray-400">
					例: ws://localhost:8080
				</div>
			</div>
		</div>
	);
}
