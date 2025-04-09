"use client";

import {
	ConnectionStatus,
	type SuperchatData,
	type WebSocketContextType,
	type WebSocketState,
} from "@/lib/types/websocket";
import { MessageType } from "@/lib/types/websocket";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

// --- 定数 --- (TODO: 設定ファイルなどに移動)
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000; // ms

/**
 * WebSocketコンテキスト
 * アプリケーション全体でWebSocketの状態と操作を共有するために使用
 */
const WebSocketContext = createContext<WebSocketContextType | undefined>(
	undefined,
);

/**
 * WebSocketプロバイダーコンポーネント
 * WebSocket接続の管理、メッセージの送受信、状態の更新を行う
 */
export function WebSocketProvider({ children }: React.PropsWithChildren) {
	const [state, set_state] = useState<WebSocketState>({
		status: ConnectionStatus.DISCONNECTED,
		url: null,
		error: null,
		retryCount: 0,
		messages: [],
	});
	const ws_ref = useRef<WebSocket | null>(null);
	const reconnect_timeout_ref = useRef<NodeJS.Timeout | null>(null);

	// --- Refs for functions to break circular dependency ---
	const connect_ref = useRef<(url: string) => void>(() => {});
	const attempt_reconnect_ref = useRef<() => void>(() => {});
	// ----------------------------------------------------

	/**
	 * 接続状態を更新する関数
	 * @param {ConnectionStatus} status - 新しい接続状態
	 * @param {string | null} [error=null] - エラーメッセージ (エラー時)
	 */
	const update_status = useCallback(
		(status: ConnectionStatus, error: string | null = null) => {
			set_state((prev) => ({
				...prev,
				status,
				error: error ?? prev.error, // エラーが指定されていれば更新
			}));
		},
		[],
	);

	/**
	 * 再接続を試みる関数
	 */
	const attempt_reconnect = useCallback(() => {
		if (
			reconnect_timeout_ref.current ||
			!state.url ||
			state.status === ConnectionStatus.CONNECTING ||
			state.status === ConnectionStatus.CONNECTED ||
			state.status === ConnectionStatus.RECONNECTING ||
			state.status === ConnectionStatus.DISCONNECTING ||
			state.retryCount >= MAX_RECONNECT_ATTEMPTS
		) {
			return;
		}

		update_status(ConnectionStatus.RECONNECTING);
		toast.info(
			`WebSocket 再接続試行 (${state.retryCount + 1}/${MAX_RECONNECT_ATTEMPTS})`,
		);

		reconnect_timeout_ref.current = setTimeout(() => {
			set_state((prev) => ({ ...prev, retryCount: prev.retryCount + 1 }));
			connect_ref.current(state.url as string); // connect -> connect_ref.current
			reconnect_timeout_ref.current = null;
		}, RECONNECT_INTERVAL);
	}, [state.url, state.status, state.retryCount, update_status]);

	/**
	 * WebSocket接続を開く関数
	 * @param {string} url - 接続先WebSocketサーバーのURL
	 */
	const connect = useCallback(
		(url: string) => {
			if (ws_ref.current && ws_ref.current.readyState < WebSocket.CLOSING) {
				console.warn("WebSocket is already connected or connecting.");
				return;
			}

			// 既存の再接続タイマーをクリア
			if (reconnect_timeout_ref.current) {
				clearTimeout(reconnect_timeout_ref.current);
				reconnect_timeout_ref.current = null;
			}

			update_status(ConnectionStatus.CONNECTING);
			set_state((prev) => ({ ...prev, url })); // URL を保存
			toast.info(`WebSocket 接続中: ${url}`);

			try {
				ws_ref.current = new WebSocket(url);

				ws_ref.current.onopen = () => {
					console.log("WebSocket connection opened");
					update_status(ConnectionStatus.CONNECTED);
					set_state((prev) => ({ ...prev, retryCount: 0, error: null })); // 接続成功時にリトライカウントとエラーをリセット
					toast.success("WebSocket 接続成功");
				};

				ws_ref.current.onmessage = (event) => {
					console.log("WebSocket message received:", event.data);
					try {
						const message_data = JSON.parse(event.data); // TODO: 型ガードを追加
						// サーバーからの PING/PONG は Rust 側で処理されるため、ここでは主にメッセージを処理
						if (
							message_data.type === MessageType.CHAT ||
							message_data.type === MessageType.SUPERCHAT
						) {
							set_state((prev) => ({
								...prev,
								messages: [...prev.messages, message_data],
							}));
						}
						// TODO: 他のメッセージタイプ (ERROR, CONNECTION_STATUS 等) の処理を追加
					} catch (parse_error) {
						console.error("Failed to parse WebSocket message:", parse_error);
						toast.error("受信メッセージの解析に失敗しました");
					}
				};

				ws_ref.current.onerror = (event) => {
					const error_msg = "WebSocket エラーが発生しました";
					console.error(error_msg, event);
					update_status(ConnectionStatus.ERROR, error_msg);
					toast.error(error_msg);
					// エラー発生時も再接続を試みる (ネットワークエラーなど)
					attempt_reconnect_ref.current(); // attempt_reconnect -> attempt_reconnect_ref.current
				};

				ws_ref.current.onclose = (event) => {
					console.log("WebSocket connection closed:", event.code, event.reason);
					// 意図しない切断の場合、再接続を試みる
					if (
						!event.wasClean &&
						state.status !== ConnectionStatus.DISCONNECTING
					) {
						update_status(
							ConnectionStatus.DISCONNECTED,
							"予期せず接続が切断されました",
						);
						toast.warning("WebSocket 接続が予期せず切断されました");
						attempt_reconnect_ref.current(); // attempt_reconnect -> attempt_reconnect_ref.current
					} else {
						// 意図的な切断 or 再接続上限
						update_status(ConnectionStatus.DISCONNECTED);
						if (state.retryCount >= MAX_RECONNECT_ATTEMPTS) {
							toast.error("WebSocket の再接続に失敗しました");
						}
					}
					ws_ref.current = null;
				};
			} catch (error) {
				const error_msg = `WebSocket 接続の初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
				console.error(error_msg);
				update_status(ConnectionStatus.ERROR, error_msg);
				toast.error("WebSocket 接続開始エラー", {
					description: error_msg,
				});
				// 初期化失敗時もリトライ
				attempt_reconnect_ref.current(); // attempt_reconnect -> attempt_reconnect_ref.current
			}
		},
		[update_status, state.status, state.retryCount],
	);

	/**
	 * WebSocket接続を閉じる関数
	 */
	const disconnect = useCallback(() => {
		if (!ws_ref.current) {
			return;
		}
		// 再接続タイマーをクリア
		if (reconnect_timeout_ref.current) {
			clearTimeout(reconnect_timeout_ref.current);
			reconnect_timeout_ref.current = null;
		}
		update_status(ConnectionStatus.DISCONNECTING);
		ws_ref.current.close(1000, "User disconnected"); // 正常終了コード
		console.log("WebSocket connection closing initiated by user.");
		// onclose ハンドラで最終的な状態更新と ws_ref.current = null が行われる
	}, [update_status]);

	// --- Update refs whenever functions change ---
	useEffect(() => {
		connect_ref.current = connect;
	}, [connect]);

	useEffect(() => {
		attempt_reconnect_ref.current = attempt_reconnect;
	}, [attempt_reconnect]);
	// --------------------------------------------

	// --- メッセージ送信関数 --- (
	/**
	 * WebSocketサーバーにメッセージを送信する共通関数
	 * @param {Record<string, any>} message_data - 送信するメッセージオブジェクト
	 */
	const send_message = useCallback((message_data: Record<string, unknown>) => {
		if (ws_ref.current && ws_ref.current.readyState === WebSocket.OPEN) {
			try {
				// IDとタイムスタンプを付与
				const message_with_meta = {
					...message_data,
					id: crypto.randomUUID(),
					timestamp: Date.now(),
				};
				ws_ref.current.send(JSON.stringify(message_with_meta));
				console.log("WebSocket message sent:", message_with_meta);
			} catch (error) {
				console.error("Failed to send WebSocket message:", error);
				toast.error("メッセージの送信に失敗しました");
			}
		} else {
			console.warn("WebSocket is not connected. Cannot send message.");
			toast.warning("WebSocket が接続されていません");
		}
	}, []);

	/**
	 * チャットメッセージを送信する関数
	 * @param {string} display_name - 表示名
	 * @param {string} message - メッセージ内容
	 */
	const send_chat_message = useCallback(
		(display_name: string, message: string) => {
			send_message({
				type: MessageType.CHAT,
				display_name,
				message,
			});
		},
		[send_message],
	);

	/**
	 * スーパーチャットメッセージを送信する関数
	 * @param {string} display_name - 表示名
	 * @param {string} message - メッセージ内容
	 * @param {SuperchatData} superchat_data - スーパーチャットデータ
	 */
	const send_superchat_message = useCallback(
		(display_name: string, message: string, superchat_data: SuperchatData) => {
			send_message({
				type: MessageType.SUPERCHAT,
				display_name,
				message,
				superchat: superchat_data,
			});
		},
		[send_message],
	);
	// --- メッセージ送信関数ここまで --- )

	/**
	 * コンポーネントのアンマウント時に接続を閉じる
	 */
	useEffect(() => {
		disconnect();
	}, [disconnect]);

	/**
	 * コンテキストに渡す値
	 * state と actions を含む
	 */
	const context_value = useMemo<WebSocketContextType>(
		() => ({
			state,
			actions: {
				connect,
				disconnect,
				sendChatMessage: send_chat_message,
				sendSuperchatMessage: send_superchat_message,
			},
		}),
		[state, connect, disconnect, send_chat_message, send_superchat_message],
	);

	return (
		<WebSocketContext.Provider value={context_value}>
			{children}
		</WebSocketContext.Provider>
	);
}

/**
 * WebSocketコンテキストを使用するためのカスタムフック
 * コンテキストが未定義の場合にエラーをスローする
 *
 * @returns {WebSocketContextType} WebSocketコンテキストの値
 * @throws {Error} WebSocketProvider内で使用されていない場合にエラーをスロー
 */
export function useWebSocket() {
	const context = useContext(WebSocketContext);
	if (context === undefined) {
		throw new Error("useWebSocket must be used within a WebSocketProvider");
	}
	return context;
}
