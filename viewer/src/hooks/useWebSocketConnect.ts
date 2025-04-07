/**
 * WebSocket接続管理フック
 *
 * このフックは、WebSocketの接続・切断・再接続を管理します。
 * URLが渡された場合、自動的に接続を開始し、コンポーネントのアンマウント時に切断します。
 *
 * @module hooks/useWebSocketConnect
 */

import { useWebSocket } from "@/components/providers/WebSocketProvider";
import { ConnectionStatus } from "@/lib/types/websocket";
import { useEffect } from "react";

/**
 * WebSocket接続を管理するためのカスタムフックのオプション
 */
interface UseWebSocketConnectOptions {
	/**
	 * 自動接続するかどうか
	 * @default true
	 */
	autoConnect?: boolean;
	/**
	 * WebSocketのURL
	 */
	url?: string;
	/**
	 * 接続状態が変化したときに呼び出されるコールバック
	 */
	onStatusChange?: (status: ConnectionStatus) => void;
	/**
	 * エラーが発生したときに呼び出されるコールバック
	 */
	onError?: (error: string | null) => void;
}

/**
 * WebSocket接続を管理するためのカスタムフック
 *
 * @param {UseWebSocketConnectOptions} options - 接続オプション
 * @returns 接続関連の状態と操作関数
 */
export function useWebSocketConnect({
	autoConnect = true,
	url,
	onStatusChange,
	onError,
}: UseWebSocketConnectOptions = {}) {
	const {
		state: { status, error, retryCount },
		actions: { connect, disconnect },
	} = useWebSocket();

	// URLが指定されている場合、自動的に接続
	useEffect(() => {
		if (autoConnect && url) {
			connect(url);
		}

		// コンポーネントのアンマウント時に切断
		return () => {
			disconnect();
		};
	}, [autoConnect, connect, disconnect, url]);

	// 接続状態の変化を監視
	useEffect(() => {
		if (onStatusChange) {
			onStatusChange(status);
		}
	}, [onStatusChange, status]);

	// エラーの変化を監視
	useEffect(() => {
		if (onError) {
			onError(error);
		}
	}, [onError, error]);

	return {
		status,
		isConnected: status === ConnectionStatus.CONNECTED,
		isConnecting:
			status === ConnectionStatus.CONNECTING ||
			status === ConnectionStatus.RECONNECTING,
		isDisconnected: status === ConnectionStatus.DISCONNECTED,
		error,
		retryCount,
		connect,
		disconnect,
	};
}
