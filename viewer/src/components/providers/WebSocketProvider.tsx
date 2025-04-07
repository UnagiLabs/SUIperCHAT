"use client";

/**
 * WebSocketProvider
 * WebSocketの接続・通信管理を行うコンテキストプロバイダーコンポーネント
 *
 * SUIperCHATの視聴者向けUIからWebSocketを通じてメッセージ送信機能を提供します。
 * クライアント側のWebSocketコンテキストとして、接続管理、メッセージ送信、状態管理を担当します。
 */

import {
	type ChatMessage,
	ConnectionStatus,
	MessageType,
	type SuperchatData,
	type SuperchatMessage,
	type WebSocketContextType,
	type WebSocketState,
} from "@/lib/types/websocket";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useReducer,
	useRef,
} from "react";
import { v4 as uuidv4 } from "uuid";

/**
 * WebSocket関連のアクションタイプを定義
 */
enum ActionType {
	CONNECT = "CONNECT",
	CONNECTED = "CONNECTED",
	DISCONNECT = "DISCONNECT",
	DISCONNECTED = "DISCONNECTED",
	RECONNECTING = "RECONNECTING",
	ERROR = "ERROR",
	ADD_MESSAGE = "ADD_MESSAGE",
	RESET = "RESET",
}

/**
 * WebSocketの状態更新に使用するアクション型
 */
type Action =
	| { type: ActionType.CONNECT; payload: { url: string } }
	| { type: ActionType.CONNECTED }
	| { type: ActionType.DISCONNECT }
	| { type: ActionType.DISCONNECTED }
	| { type: ActionType.RECONNECTING }
	| { type: ActionType.ERROR; payload: { error: string } }
	| {
			type: ActionType.ADD_MESSAGE;
			payload: { message: ChatMessage | SuperchatMessage };
	  }
	| { type: ActionType.RESET };

/**
 * WebSocketの初期状態
 */
const initialState: WebSocketState = {
	status: ConnectionStatus.DISCONNECTED,
	url: null,
	error: null,
	retryCount: 0,
	messages: [],
};

/**
 * WebSocketのコンテキスト初期値
 */
const initialContext: WebSocketContextType = {
	state: initialState,
	actions: {
		connect: () => {},
		disconnect: () => {},
		sendChatMessage: () => {},
		sendSuperchatMessage: () => {},
	},
};

/**
 * WebSocketのReducer関数
 * 状態の更新ロジックを定義
 */
function reducer(state: WebSocketState, action: Action): WebSocketState {
	switch (action.type) {
		case ActionType.CONNECT:
			return {
				...state,
				status: ConnectionStatus.CONNECTING,
				url: action.payload.url,
				error: null,
			};
		case ActionType.CONNECTED:
			return {
				...state,
				status: ConnectionStatus.CONNECTED,
				error: null,
				retryCount: 0,
			};
		case ActionType.DISCONNECT:
			return {
				...state,
				status: ConnectionStatus.DISCONNECTING,
			};
		case ActionType.DISCONNECTED:
			return {
				...state,
				status: ConnectionStatus.DISCONNECTED,
			};
		case ActionType.RECONNECTING:
			return {
				...state,
				status: ConnectionStatus.RECONNECTING,
				retryCount: state.retryCount + 1,
			};
		case ActionType.ERROR:
			return {
				...state,
				status: ConnectionStatus.ERROR,
				error: action.payload.error,
			};
		case ActionType.ADD_MESSAGE:
			return {
				...state,
				messages: [...state.messages, action.payload.message],
			};
		case ActionType.RESET:
			return initialState;
		default:
			return state;
	}
}

/**
 * WebSocketコンテキストの作成
 */
const WebSocketContext = createContext<WebSocketContextType>(initialContext);

/**
 * WebSocketコンテキストプロバイダーのプロパティ
 */
interface WebSocketProviderProps {
	children: React.ReactNode;
	/**
	 * 自動再接続を試みる最大回数
	 * @default 5
	 */
	maxRetries?: number;
	/**
	 * 再接続の間隔（ミリ秒）
	 * @default 3000
	 */
	retryInterval?: number;
}

/**
 * WebSocketコンテキストプロバイダーコンポーネント
 * WebSocketの接続・通信管理を提供するプロバイダー
 */
export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
	children,
	maxRetries = 5,
	retryInterval = 3000,
}) => {
	const [state, dispatch] = useReducer(reducer, initialState);
	const socketRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	/**
	 * WebSocket接続を確立する関数
	 */
	const connect = useCallback(
		(url: string) => {
			// 既に接続している場合は切断
			if (socketRef.current) {
				socketRef.current.close(1000, "意図的な切断");
				socketRef.current = null;
			}

			dispatch({ type: ActionType.CONNECT, payload: { url } });

			try {
				// WebSocket接続を作成
				const socket = new WebSocket(url);

				// 接続時のイベントハンドラ
				socket.onopen = () => {
					console.log("WebSocket接続が確立されました");
					dispatch({ type: ActionType.CONNECTED });
				};

				// メッセージ受信時のイベントハンドラ
				socket.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);

						if (
							data.type === MessageType.CHAT ||
							data.type === MessageType.SUPERCHAT
						) {
							dispatch({
								type: ActionType.ADD_MESSAGE,
								payload: { message: data },
							});
						}
					} catch (error) {
						console.error("メッセージの解析に失敗しました:", error);
					}
				};

				// エラー発生時のイベントハンドラ
				socket.onerror = (error) => {
					console.error("WebSocketエラー:", error);
					dispatch({
						type: ActionType.ERROR,
						payload: { error: "WebSocket接続エラーが発生しました" },
					});
				};

				// 接続切断時のイベントハンドラ
				socket.onclose = (event) => {
					console.log(
						"WebSocket接続が閉じられました:",
						event.code,
						event.reason,
					);
					dispatch({ type: ActionType.DISCONNECTED });

					// 異常切断の場合、再接続を試みる
					if (!event.wasClean && state.retryCount < maxRetries) {
						dispatch({ type: ActionType.RECONNECTING });
						if (reconnectTimeoutRef.current) {
							clearTimeout(reconnectTimeoutRef.current);
						}
						reconnectTimeoutRef.current = setTimeout(() => {
							console.log(
								`再接続を試みています... (${state.retryCount + 1}/${maxRetries})`,
							);
							connect(url);
						}, retryInterval);
					}
				};

				socketRef.current = socket;
			} catch (error) {
				console.error("WebSocket接続の作成に失敗しました:", error);
				dispatch({
					type: ActionType.ERROR,
					payload: { error: "WebSocket接続の作成に失敗しました" },
				});
			}
		},
		[maxRetries, state.retryCount, retryInterval],
	);

	/**
	 * WebSocket接続を切断する関数
	 */
	const disconnect = useCallback(() => {
		if (socketRef.current) {
			dispatch({ type: ActionType.DISCONNECT });

			// タイムアウトをクリア
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}

			// 正常に接続が閉じられるようにする
			socketRef.current.close(1000, "意図的な切断");
			socketRef.current = null;
		}
	}, []);

	/**
	 * チャットメッセージを送信する関数
	 */
	const sendChatMessage = useCallback(
		(displayName: string, message: string) => {
			if (socketRef.current && state.status === ConnectionStatus.CONNECTED) {
				const chatMessage: ChatMessage = {
					type: MessageType.CHAT,
					id: uuidv4(),
					timestamp: Date.now(),
					display_name: displayName,
					message: message,
				};

				try {
					socketRef.current.send(JSON.stringify(chatMessage));
					dispatch({
						type: ActionType.ADD_MESSAGE,
						payload: { message: chatMessage },
					});
				} catch (error) {
					console.error("メッセージの送信に失敗しました:", error);
					dispatch({
						type: ActionType.ERROR,
						payload: { error: "メッセージの送信に失敗しました" },
					});
				}
			} else {
				console.error(
					"WebSocketが接続されていないため、メッセージを送信できません",
				);
				dispatch({
					type: ActionType.ERROR,
					payload: {
						error:
							"WebSocketが接続されていないため、メッセージを送信できません",
					},
				});
			}
		},
		[state.status],
	);

	/**
	 * スーパーチャットメッセージを送信する関数
	 */
	const sendSuperchatMessage = useCallback(
		(displayName: string, message: string, superchatData: SuperchatData) => {
			if (socketRef.current && state.status === ConnectionStatus.CONNECTED) {
				const superchatMessage: SuperchatMessage = {
					type: MessageType.SUPERCHAT,
					id: uuidv4(),
					timestamp: Date.now(),
					display_name: displayName,
					message: message,
					superchat: superchatData,
				};

				try {
					socketRef.current.send(JSON.stringify(superchatMessage));
					dispatch({
						type: ActionType.ADD_MESSAGE,
						payload: { message: superchatMessage },
					});
				} catch (error) {
					console.error(
						"スーパーチャットメッセージの送信に失敗しました:",
						error,
					);
					dispatch({
						type: ActionType.ERROR,
						payload: {
							error: "スーパーチャットメッセージの送信に失敗しました",
						},
					});
				}
			} else {
				console.error(
					"WebSocketが接続されていないため、スーパーチャットメッセージを送信できません",
				);
				dispatch({
					type: ActionType.ERROR,
					payload: {
						error:
							"WebSocketが接続されていないため、スーパーチャットメッセージを送信できません",
					},
				});
			}
		},
		[state.status],
	);

	/**
	 * コンポーネントのアンマウント時に接続を切断
	 */
	useEffect(() => {
		return () => {
			disconnect();
		};
	}, [disconnect]);

	// コンテキスト値の作成
	const contextValue: WebSocketContextType = {
		state,
		actions: {
			connect,
			disconnect,
			sendChatMessage,
			sendSuperchatMessage,
		},
	};

	return (
		<WebSocketContext.Provider value={contextValue}>
			{children}
		</WebSocketContext.Provider>
	);
};

/**
 * WebSocketコンテキストを使用するためのカスタムフック
 * @returns WebSocketコンテキスト
 * @throws コンテキストがプロバイダー外で使用された場合にエラー
 */
export const useWebSocket = (): WebSocketContextType => {
	const context = useContext(WebSocketContext);

	if (context === undefined) {
		throw new Error(
			"useWebSocketはWebSocketProviderの中で使用する必要があります",
		);
	}

	return context;
};
