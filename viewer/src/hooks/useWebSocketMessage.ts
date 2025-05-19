/**
 * WebSocketメッセージ処理カスタムフック
 *
 * WebSocketメッセージの送受信と処理を行うロジックを提供します。
 * チャットやスーパーチャットの送信、受信メッセージの処理を担当します。
 *
 * @module hooks/useWebSocketMessage
 */

import {
	type ChatMessage,
	ConnectionStatus,
	MessageType,
	type SuperchatData,
	type SuperchatMessage,
	type WebSocketState,
} from "@/lib/types/websocket";
import {
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
	useCallback,
} from "react";

/**
 * WebSocketメッセージハンドラーオプション
 */
interface UseWebSocketMessageHandlerOptions {
	wsRef: MutableRefObject<WebSocket | null>;
	setState: Dispatch<SetStateAction<WebSocketState>>; // ProviderのsetState
	updateStatus: (status: ConnectionStatus, error?: string | null) => void; // 接続フックから受け取る想定だが、一旦Providerから
}

/**
 * WebSocketメッセージ処理フック
 * WebSocketメッセージの送受信と処理ロジックを提供します
 */
export function useWebSocketMessageHandler({
	wsRef,
	setState,
	updateStatus,
}: UseWebSocketMessageHandlerOptions) {
	/**
	 * メッセージ受信イベントハンドラ
	 * WebSocketから受信したメッセージを処理する関数
	 *
	 * @param event WebSocketのメッセージイベント
	 */
	const handleMessage = useCallback(
		(event: MessageEvent) => {
			// メッセージ本文のパース
			try {
				const data = JSON.parse(event.data);
				console.debug("受信メッセージ:", data);

				// メッセージタイプによる処理分岐
				switch (data.type) {
					case MessageType.CHAT:
						{
							// チャットメッセージ受信処理
							const chatMessage: ChatMessage = {
								id: data.id,
								type: MessageType.CHAT,
								display_name: data.display_name,
								message: data.message,
								timestamp: data.timestamp,
							};

							// メッセージリストに追加
							setState((prev) => {
								// 重複を避けるためID確認
								if (prev.messages.some((msg) => msg.id === chatMessage.id)) {
									return prev;
								}
								return {
									...prev,
									messages: [...prev.messages, chatMessage],
								};
							});
						}
						break;

					case MessageType.SUPERCHAT:
						{
							// スーパーチャットメッセージ受信処理
							const superchatMessage: SuperchatMessage = {
								id: data.id,
								type: MessageType.SUPERCHAT,
								display_name: data.display_name,
								message: data.message,
								timestamp: data.timestamp,
								superchat: {
									amount: data.superchat.amount,
									coin: data.superchat.coin,
									tx_hash: data.superchat.tx_hash,
									wallet_address: data.superchat.wallet_address,
								},
							};

							// メッセージリストに追加
							setState((prev) => {
								// 重複を避けるためID確認
								if (
									prev.messages.some((msg) => msg.id === superchatMessage.id)
								) {
									return prev;
								}
								return {
									...prev,
									messages: [...prev.messages, superchatMessage],
								};
							});
						}
						break;

					case MessageType.PONG:
						// PONGメッセージ受信時の処理
						console.debug("PONG received");
						break;

					case MessageType.ERROR:
						// エラーメッセージ受信時の処理
						console.error("WebSocket Error:", data.message);
						updateStatus(ConnectionStatus.ERROR, data.message);
						break;

					default:
						console.debug("Unhandled message type:", data.type);
				}
			} catch (err) {
				console.error("Failed to parse WebSocket message:", err, event.data);
			}
		},
		[setState, updateStatus],
	);

	/**
	 * チャットメッセージを送信する関数
	 *
	 * @param displayName 表示名
	 * @param message メッセージ内容
	 */
	const sendChatMessage = useCallback(
		(displayName: string, message: string) => {
			if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
				console.error(
					"チャットメッセージを送信できません: WebSocket接続がありません",
				);
				return;
			}

			try {
				const chatMessage = {
					type: MessageType.CHAT,
					id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
					display_name: displayName,
					content: message,
					timestamp: Date.now(),
				};

				console.debug("チャットメッセージ送信:", chatMessage);
				wsRef.current.send(JSON.stringify(chatMessage));
			} catch (error) {
				console.error("チャットメッセージ送信エラー:", error);
				updateStatus(
					ConnectionStatus.ERROR,
					`チャットの送信に失敗しました: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		},
		[wsRef, updateStatus],
	);

	/**
	 * スーパーチャットメッセージを送信する関数
	 *
	 * @param displayName 表示名
	 * @param message メッセージ内容
	 * @param superchatData スーパーチャットデータ
	 */
	const sendSuperchatMessage = useCallback(
		(displayName: string, message: string, superchatData: SuperchatData) => {
			if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
				console.error(
					"スーパーチャットを送信できません: WebSocket接続がありません",
				);
				return;
			}

			try {
				const superchatMessage = {
					type: MessageType.SUPERCHAT,
					id: `superchat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
					display_name: displayName,
					content: message,
					timestamp: Date.now(),
					superchat: superchatData,
				};

				console.debug("スーパーチャットメッセージ送信:", superchatMessage);
				wsRef.current.send(JSON.stringify(superchatMessage));
			} catch (error) {
				console.error("スーパーチャットメッセージ送信エラー:", error);
				updateStatus(
					ConnectionStatus.ERROR,
					`スーパーチャットの送信に失敗しました: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		},
		[wsRef, updateStatus],
	);

	// 返却値: メッセージ処理関連の関数やステート
	return {
		handleMessage,
		sendChatMessage,
		sendSuperchatMessage,
	};
}

/**
 * WebSocketプロバイダーから提供されるメッセージ機能を使用するためのフック
 * WebSocketContextから状態とアクションを取得し、メッセージ関連の機能を提供
 *
 * @returns WebSocketのメッセージ関連機能
 */
export function useWebSocketMessage() {
	// この関数は現在ダミー実装で、将来的にはWebSocketProviderのコンテキストから
	// メッセージ関連の状態とアクションを取得する実装に置き換えられる予定。
	// WebSocketProviderとの連携が完了したら実装する。

	// 仮実装として空の値を返す
	return {
		/**
		 * メッセージリスト
		 */
		messages: [],

		/**
		 * チャットメッセージを送信
		 * @param displayName 表示名
		 * @param message メッセージ内容
		 */
		sendChatMessage: (displayName: string, message: string) => {
			console.warn("WebSocketProviderとの連携が未実装です: sendChatMessage");
		},

		/**
		 * スーパーチャットを送信
		 * @param displayName 表示名
		 * @param message メッセージ内容
		 * @param superchatData スーパーチャット情報
		 */
		sendSuperchatMessage: (
			displayName: string,
			message: string,
			superchatData: SuperchatData,
		) => {
			console.warn(
				"WebSocketProviderとの連携が未実装です: sendSuperchatMessage",
			);
		},

		/**
		 * 過去ログ取得中フラグ
		 */
		isLoadingHistory: false,

		/**
		 * さらに古いログがあるかどうか
		 */
		hasMoreHistory: false,

		/**
		 * 履歴取得中のエラーメッセージ
		 */
		historyError: null,

		/**
		 * 古いメッセージをさらに読み込む
		 * @param limit 取得件数
		 */
		loadMoreHistory: (limit?: number) => {
			console.warn("WebSocketProviderとの連携が未実装です: loadMoreHistory");
		},
	};
}
