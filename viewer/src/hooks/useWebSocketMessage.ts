// Provider修正後に有効化
import { useWebSocket } from "@/components/providers/WebSocketProvider";
import {
	type ChatMessage,
	ConnectionStatus,
	MessageType,
	type SuperchatData,
	type SuperchatMessage,
	type WebSocketState,
} from "@/lib/types/websocket";
/**
 * WebSocketメッセージ送受信管理フック
 *
 * @module hooks/useWebSocketMessage
 */
import {
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
	useCallback,
	useMemo,
} from "react";

// --- 内部的なメッセージ処理ロジックフック ---
interface UseWebSocketMessageHandlerOptions {
	wsRef: MutableRefObject<WebSocket | null>;
	setState: Dispatch<SetStateAction<WebSocketState>>; // ProviderのsetState
	updateStatus: (status: ConnectionStatus, error?: string | null) => void; // 接続フックから受け取る想定だが、一旦Providerから
}

/**
 * WebSocketのメッセージ送受信のコアロジックを管理する内部フック
 */
export function useWebSocketMessageHandler({
	wsRef,
	setState,
	updateStatus,
}: UseWebSocketMessageHandlerOptions) {
	// メッセージ受信処理 (Providerのonmessageから呼び出される)
	const handleMessage = useCallback(
		(event: MessageEvent) => {
			console.debug(
				"WebSocketメッセージ受信(hook):",
				event.data.substring(0, 100) + (event.data.length > 100 ? "..." : ""),
			);
			try {
				if (!event.data) {
					console.warn("空のWebSocketメッセージ受信 (hook)");
					return;
				}

				let parsedData: Record<string, unknown>;
				try {
					parsedData = JSON.parse(event.data);
				} catch (parseError) {
					console.error("JSON解析失敗 (hook):", event.data, parseError);
					updateStatus(ConnectionStatus.CONNECTED, "メッセージ解析失敗"); // 接続自体は維持
					return;
				}

				if (!parsedData.type || typeof parsedData.type !== "string") {
					console.error("typeフィールド不正 (hook):", parsedData);
					return;
				}

				const messageType = parsedData.type as string;

				switch (messageType) {
					case MessageType.CHAT:
					case MessageType.SUPERCHAT: {
						console.debug(`${messageType}メッセージ処理中 (hook)...`);
						// 型ガードとフィールド検証
						if (
							typeof parsedData.display_name !== "string" ||
							typeof parsedData.message !== "string" ||
							!parsedData.id ||
							typeof parsedData.id !== "string" || // IDの型もチェック
							!parsedData.timestamp ||
							typeof parsedData.timestamp !== "number" // Timestampの型もチェック
						) {
							console.error(
								"必須フィールド不足(CHAT/SUPERCHAT) (hook):",
								parsedData,
							);
							return;
						}

						const baseMessage: Partial<ChatMessage | SuperchatMessage> = {
							type: messageType as MessageType.CHAT | MessageType.SUPERCHAT,
							display_name: parsedData.display_name,
							message: parsedData.message,
							id: parsedData.id,
							timestamp: parsedData.timestamp,
						};

						if (messageType === MessageType.SUPERCHAT) {
							// スーパーチャットの型ガード
							const superchat = parsedData.superchat as Record<string, unknown>;
							if (
								!superchat ||
								typeof superchat !== "object" ||
								typeof superchat.amount !== "number" ||
								typeof superchat.tx_hash !== "string" ||
								typeof superchat.wallet_address !== "string"
							) {
								console.error(
									"必須フィールド不足(SUPERCHAT data) (hook):",
									parsedData,
								);
								return;
							}
							(baseMessage as Partial<SuperchatMessage>).superchat = {
								amount: superchat.amount,
								tx_hash: superchat.tx_hash,
								wallet_address: superchat.wallet_address,
							};
						}

						// 状態にメッセージを追加
						setState((prev) => {
							const message =
								messageType === MessageType.CHAT
									? (baseMessage as ChatMessage)
									: (baseMessage as SuperchatMessage);
							// 重複チェック (IDが存在すれば)
							if (prev.messages.some((m) => m.id === message.id)) {
								console.warn(`重複メッセージID (${message.id}) をスキップ`);
								return prev;
							}
							const newMessages = [...prev.messages, message];
							console.debug(
								`メッセージ追加(hook)。新メッセージ数: ${newMessages.length}`,
							);
							return { ...prev, messages: newMessages };
						});
						break;
					}
					case MessageType.ERROR: {
						if (typeof parsedData.message === "string") {
							console.error("サーバーエラー受信 (hook):", parsedData.message);
							updateStatus(
								ConnectionStatus.CONNECTED,
								`サーバーエラー: ${parsedData.message}`,
							);
						} else {
							console.error(
								"不正なサーバーエラーメッセージ (hook):",
								parsedData,
							);
							updateStatus(
								ConnectionStatus.CONNECTED,
								"不正なサーバーエラー受信",
							);
						}
						break;
					}
					case MessageType.CONNECTION_STATUS: {
						console.log(
							"接続状態更新(サーバー通知) (hook):",
							parsedData.status,
							parsedData.info ?? "",
						);
						// クライアント側の状態管理に影響を与えるかは要検討
						break;
					}
					case MessageType.PING:
					case MessageType.PONG:
						console.debug(`${messageType}メッセージ受信 (hook)`);
						break;
					default:
						console.warn("未知のメッセージタイプ受信 (hook):", messageType);
				}
			} catch (error) {
				console.error("メッセージ処理中エラー (hook):", error);
				updateStatus(ConnectionStatus.CONNECTED, "メッセージ処理失敗");
			}
		},
		[setState, updateStatus],
	);

	// 共通メッセージ送信ロジック (Providerから呼び出される)
	const sendMessageInternal = useCallback(
		(messageData: Record<string, unknown>) => {
			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				try {
					const messageWithMeta = {
						...messageData,
						id: crypto.randomUUID(),
						timestamp: Date.now(),
					};
					wsRef.current.send(JSON.stringify(messageWithMeta));
					console.debug("WebSocketメッセージ送信 (hook):", messageWithMeta);
				} catch (error) {
					console.error("メッセージ送信失敗 (hook):", error);
					updateStatus(ConnectionStatus.CONNECTED, "メッセージ送信失敗"); // 接続自体は維持
				}
			} else {
				console.warn("WebSocket未接続、メッセージ送信不可 (hook)");
				// 必要であればエラー状態を更新する
				// updateStatus(ConnectionStatus.CONNECTED, "メッセージ送信不可: 未接続");
			}
		},
		[wsRef, updateStatus],
	);

	// チャットメッセージ送信 (外部公開用)
	const sendChatMessage = useCallback(
		(displayName: string, message: string) => {
			sendMessageInternal({
				type: MessageType.CHAT,
				display_name: displayName,
				message,
			});
		},
		[sendMessageInternal],
	);

	// スーパーチャットメッセージ送信 (外部公開用)
	const sendSuperchatMessage = useCallback(
		(displayName: string, message: string, superchatData: SuperchatData) => {
			sendMessageInternal({
				type: MessageType.SUPERCHAT,
				display_name: displayName,
				message,
				superchat: superchatData,
			});
		},
		[sendMessageInternal],
	);

	// Providerが利用するハンドラと、外部公開用アクションを返す
	return {
		handleMessage,
		sendChatMessage,
		sendSuperchatMessage,
		sendMessageInternal, // Provider内部でのみ使う想定
	};
}

// --- 外部向けフック ---
/**
 * WebSocketでメッセージを送受信するためのカスタムフック (外部向けAPI)
 * Providerから状態とメッセージアクションを取得する
 */
export function useWebSocketMessage() {
	// Providerから状態とアクションを取得 (Provider修正後に有効化)
	const {
		state: { status, messages },
		actions,
	} = useWebSocket();

	// 送信可能かどうか
	const canSend = useMemo(
		() => status === ConnectionStatus.CONNECTED,
		[status],
	);

	// 送信関数のラッパー (エラーハンドリングは内部で行われている想定)
	const sendChat = useCallback(
		(displayName: string, message: string): boolean => {
			if (!canSend || !actions.sendChatMessage) {
				console.warn(
					"Cannot send chat message, not connected or action unavailable.",
				);
				return false;
			}
			actions.sendChatMessage(displayName, message);
			return true; // 呼び出し自体は成功したとみなす
		},
		[canSend, actions], // actions全体を依存配列に追加
	);

	const sendSuperchat = useCallback(
		(
			displayName: string,
			message: string,
			superchatData: SuperchatData,
		): boolean => {
			if (!canSend || !actions.sendSuperchatMessage) {
				console.warn(
					"Cannot send superchat message, not connected or action unavailable.",
				);
				return false;
			}
			actions.sendSuperchatMessage(displayName, message, superchatData);
			return true; // 呼び出し自体は成功したとみなす
		},
		[canSend, actions], // actions全体を依存配列に追加
	);

	// Providerから取得した状態とラップしたアクションを返す
	return {
		canSend,
		messages, // メッセージリストをそのまま公開
		sendChat,
		sendSuperchat,
	};
}
