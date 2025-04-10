"use client";

/**
 * WebSocket接続状態表示コンポーネント
 *
 * 画面の目立たない位置にWebSocket接続状態と接続先URLを表示します。
 * このコンポーネントは、開発時やデバッグ時に接続状態を確認するのに役立ちます。
 *
 * @module components/ui/ws-connection-status
 */

import { useWebSocket } from "@/components/providers/WebSocketProvider";
import { ConnectionStatus } from "@/lib/types/websocket";
import { useState } from "react";
import type React from "react";

/**
 * WebSocket接続状態表示コンポーネント
 *
 * @returns {React.ReactElement} WebSocket接続状態を表示するコンポーネント
 */
export function WebSocketConnectionStatus(): React.ReactElement {
	const { state } = useWebSocket();
	const [visible, set_visible] = useState(true);

	// 接続状態に応じたスタイルを設定
	const status_style = {
		[ConnectionStatus.CONNECTED]: "bg-green-500",
		[ConnectionStatus.CONNECTING]: "bg-yellow-500",
		[ConnectionStatus.RECONNECTING]: "bg-yellow-500",
		[ConnectionStatus.DISCONNECTED]: "bg-red-500",
		[ConnectionStatus.DISCONNECTING]: "bg-orange-500",
		[ConnectionStatus.ERROR]: "bg-red-500",
	};

	// 接続状態に応じたテキストを設定
	const status_text = {
		[ConnectionStatus.CONNECTED]: "接続済み",
		[ConnectionStatus.CONNECTING]: "接続中",
		[ConnectionStatus.RECONNECTING]: "再接続中",
		[ConnectionStatus.DISCONNECTED]: "未接続",
		[ConnectionStatus.DISCONNECTING]: "切断中",
		[ConnectionStatus.ERROR]: "エラー",
	};

	return (
		<div
			className={`fixed bottom-1 right-1 z-50 ${visible ? "opacity-60" : "opacity-0"} hover:opacity-100 transition-opacity group`}
		>
			<div className="flex items-center gap-2 text-xs p-1 rounded bg-muted text-muted-foreground">
				<div className={`h-2 w-2 rounded-full ${status_style[state.status]}`} />
				<span>{status_text[state.status]}</span>
				{state.url && (
					<span className="hidden group-hover:inline">: {state.url}</span>
				)}
				<button
					type="button"
					onClick={() => set_visible(!visible)}
					className="ml-1 text-xs hover:text-foreground"
				>
					{visible ? "×" : "+"}
				</button>
			</div>
		</div>
	);
}
