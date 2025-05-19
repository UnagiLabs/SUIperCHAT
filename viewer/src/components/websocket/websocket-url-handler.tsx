/**
 * WebSocketUrlHandlerコンポーネント
 *
 * URLパラメータからWebSocket URLと配信者アドレスを取得し、
 * WebSocketに接続するためのコンポーネントです。
 *
 * このコンポーネントは表示要素を持たず、URLパラメータからの接続処理のみを行います。
 * 以下のURLパラメータに対応しています:
 * - wsUrl: WebSocketのURL (URLエンコードされた状態)
 * - streamerAddress: 配信者のウォレットアドレス
 *
 * @module components/websocket/websocket-url-handler
 */

"use client";

import { useWebSocket } from "@/components/providers/WebSocketProvider";
import { ConnectionStatus } from "@/lib/types/websocket";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * WebSocketUrlHandlerコンポーネント
 *
 * @returns {null} 表示要素なし
 */
export default function WebSocketUrlHandler() {
	const search_params = useSearchParams();
	const { state, actions } = useWebSocket();

	useEffect(() => {
		const ws_url_encoded = search_params.get("wsUrl");
		const streamer_address = search_params.get("streamerAddress");

		console.log("Search params:", {
			ws_url_encoded,
			streamer_address,
		});

		if (
			ws_url_encoded &&
			streamer_address &&
			state.status === ConnectionStatus.DISCONNECTED
		) {
			try {
				const ws_url = decodeURIComponent(ws_url_encoded);
				console.log(`Attempting to connect to WebSocket: ${ws_url}`);
				console.log(`Streamer Wallet Address: ${streamer_address}`);
				console.log(`Connection status: ${state.status}`);

				let final_url = ws_url;
				if (!ws_url.endsWith("/ws")) {
					final_url = ws_url.endsWith("/") ? `${ws_url}ws` : `${ws_url}/ws`;
					console.log(`URLにパスが含まれていないため、/wsを追加: ${final_url}`);
				}

				actions.connect(final_url);
			} catch (error) {
				console.error("Failed to decode WebSocket URL:", error);
				console.error("Original encoded URL:", ws_url_encoded);
			}
		} else {
			console.log("Not connecting because:", {
				hasWsUrl: Boolean(ws_url_encoded),
				hasStreamerAddress: Boolean(streamer_address),
				connectionStatus: state.status,
			});
		}
	}, [search_params, state.status, actions]);

	// このコンポーネントは表示要素を持たない
	return null;
}
