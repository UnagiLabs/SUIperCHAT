/**
 * WebSocketメッセージ送信フック
 *
 * このフックは、WebSocket経由でのメッセージ送信機能を提供します。
 * 通常のチャットメッセージとスーパーチャットメッセージの両方の送信に対応しています。
 *
 * @module hooks/useWebSocketMessage
 */

import { useWebSocket } from "@/components/providers/WebSocketProvider";
import { ConnectionStatus, type SuperchatData } from "@/lib/types/websocket";
import { useMemo } from "react";

/**
 * WebSocketでメッセージを送信するためのカスタムフック
 *
 * @returns メッセージ送信関連の状態と関数
 */
export function useWebSocketMessage() {
	const {
		state: { status, messages },
		actions: { sendChatMessage, sendSuperchatMessage },
	} = useWebSocket();

	// 送信可能かどうかを判定
	const canSend = useMemo(
		() => status === ConnectionStatus.CONNECTED,
		[status],
	);

	/**
	 * チャットメッセージを送信する関数
	 *
	 * @param {string} displayName - 表示名
	 * @param {string} message - メッセージ内容
	 * @returns {boolean} 送信に成功したかどうか
	 */
	const sendChat = (displayName: string, message: string): boolean => {
		if (!canSend) {
			return false;
		}

		try {
			sendChatMessage(displayName, message);
			return true;
		} catch (error) {
			console.error("チャットメッセージの送信に失敗しました:", error);
			return false;
		}
	};

	/**
	 * スーパーチャットメッセージを送信する関数
	 *
	 * @param {string} displayName - 表示名
	 * @param {string} message - メッセージ内容
	 * @param {SuperchatData} superchatData - スーパーチャットデータ
	 * @returns {boolean} 送信に成功したかどうか
	 */
	const sendSuperchat = (
		displayName: string,
		message: string,
		superchatData: SuperchatData,
	): boolean => {
		if (!canSend) {
			return false;
		}

		try {
			sendSuperchatMessage(displayName, message, superchatData);
			return true;
		} catch (error) {
			console.error("スーパーチャットメッセージの送信に失敗しました:", error);
			return false;
		}
	};

	return {
		canSend,
		messages,
		sendChat,
		sendSuperchat,
	};
}
