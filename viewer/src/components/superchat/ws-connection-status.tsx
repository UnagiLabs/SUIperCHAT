"use client";

/**
 * WebSocket接続状態表示コンポーネント
 *
 * 画面の目立たない位置にWebSocket接続状態と接続先URLを表示します。
 * このコンポーネントは、開発時やデバッグ時に接続状態を確認するのに役立ちます。
 * 接続状態が「connected」の場合は非表示となり、問題がある場合のみ表示されます。
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
 * 「connected」状態では非表示となり、その他の状態（connecting, disconnected等）でのみ表示されます。
 *
 * @returns {React.ReactElement | null} WebSocket接続状態を表示するコンポーネントまたはnull
 */
export function WebSocketConnectionStatus(): React.ReactElement | null {
	const { state } = useWebSocket();
	const [visible, set_visible] = useState(true);

	// connected状態では何も表示しない
	if (state.status === ConnectionStatus.CONNECTED) {
		return null;
	}

	// 接続状態に応じたスタイルを設定
	const status_style = {
		[ConnectionStatus.CONNECTED]: "bg-green-500",
		[ConnectionStatus.CONNECTING]: "bg-yellow-500",
		[ConnectionStatus.RECONNECTING]: "bg-yellow-500",
		[ConnectionStatus.DISCONNECTED]: "bg-red-500",
		[ConnectionStatus.DISCONNECTING]: "bg-orange-500",
		[ConnectionStatus.ERROR]: "bg-red-500",
	};

	/**
	 * テキストを接続状態に応じて設定します。
	 * Sets the text based on the connection status.
	 */
	const status_text: { [key in ConnectionStatus]: string } = {
		[ConnectionStatus.CONNECTED]: "Connected",
		[ConnectionStatus.CONNECTING]: "Connecting",
		[ConnectionStatus.RECONNECTING]: "Reconnecting",
		[ConnectionStatus.DISCONNECTED]: "Disconnected",
		[ConnectionStatus.DISCONNECTING]: "Disconnecting",
		[ConnectionStatus.ERROR]: "Error",
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
