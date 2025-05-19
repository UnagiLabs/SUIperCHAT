/**
 * WebSocketプロバイダー
 * チャットやスーパーチャットの送受信を管理するWebSocketコンテキストを提供する
 *
 * @file WebSocketプロバイダーの実装
 */
"use client";

import { useWebSocketConnectionManager } from "@/hooks/useWebSocketConnect"; // 接続管理ロジック
import { useWebSocketMessageHandler } from "@/hooks/useWebSocketMessage"; // メッセージ処理ロジック
import {
	ConnectionStatus,
	type HistoryDataMessage,
	MessageType,
	type WebSocketContextType,
	type WebSocketState,
} from "@/lib/types/websocket";
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

/**
 * WebSocketコンテキスト
 * アプリケーション全体でWebSocketの状態と操作を共有するために使用
 */
const WebSocketContext = createContext<WebSocketContextType | undefined>(
	undefined,
);

/**
 * WebSocketの初期状態
 */
const INITIAL_STATE: WebSocketState = {
	status: ConnectionStatus.DISCONNECTED,
	url: null,
	error: null,
	retryCount: 0,
	messages: [],
	isLoadingHistory: false,
	hasMoreHistory: true,
	historyError: null,
	oldestMessageTimestamp: null,
};

/**
 * WebSocketプロバイダーコンポーネント
 *
 * アプリケーション全体でWebSocketの状態と操作を共有するためのコンテキストプロバイダー。
 *
 * @param props - プロバイダーのプロパティ
 * @returns WebSocketプロバイダーのJSXエレメント
 */
export function WebSocketProvider({
	children,
	autoConnect = true,
	url = null,
}: {
	children: React.ReactNode;
	autoConnect?: boolean;
	url?: string | null;
}) {
	// WebSocketの状態
	const [state, setState] = useState<WebSocketState>(INITIAL_STATE);
	const wsRef = useRef<WebSocket | null>(null);

	// メッセージハンドラの取得 (標準ハンドラ)
	const standardMessageHandler = useWebSocketMessageHandler({
		wsRef,
		setState,
		updateStatus: (status, error) => {
			setState((prev) => ({
				...prev,
				status,
				error: error !== undefined ? error : prev.error,
			}));
		},
	});

	// WebSocketメッセージハンドラの拡張 (過去ログ処理用)
	const handleHistoryMessage = useCallback((data: HistoryDataMessage) => {
		console.debug(`履歴データ受信: ${data.payload.messages.length}件`);

		setState((prev) => {
			// 既存メッセージのIDを取得
			const existingMessageIds = new Set(prev.messages.map((msg) => msg.id));

			// 重複を除外して新しいメッセージを追加
			const newMessages = [
				...data.payload.messages.filter(
					(msg) => !existingMessageIds.has(msg.id),
				),
				...prev.messages,
			];

			// メッセージをタイムスタンプでソート
			newMessages.sort((a, b) => a.timestamp - b.timestamp);

			// 最も古いメッセージのタイムスタンプを更新
			const oldestMessage = newMessages[0];
			const oldestTimestamp = oldestMessage ? oldestMessage.timestamp : null;

			return {
				...prev,
				messages: newMessages,
				isLoadingHistory: false,
				hasMoreHistory: data.payload.has_more,
				historyError: null,
				oldestMessageTimestamp: oldestTimestamp,
			};
		});
	}, []);

	// カスタムメッセージハンドラ (メッセージタイプに応じて処理を振り分け)
	const customHandleMessage = useCallback(
		(event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data);
				console.debug("受信メッセージ:", data.type);

				if (data.type === MessageType.HISTORY_DATA) {
					handleHistoryMessage(data);
					return; // カスタム処理で対応したので標準ハンドラをスキップ
				}

				// それ以外のメッセージは標準ハンドラに委譲
				if (standardMessageHandler.handleMessage) {
					standardMessageHandler.handleMessage(event);
				}
			} catch (err) {
				console.error("WebSocketメッセージ処理エラー:", err);
			}
		},
		[handleHistoryMessage, standardMessageHandler],
	);

	// WebSocketインスタンスの作成
	const connectWebSocketInstance = useCallback(
		(wsUrl: string) => {
			try {
				// 既存の接続があれば閉じる
				if (wsRef.current) {
					wsRef.current.onclose = null; // 古い接続のイベントハンドラを解除
					wsRef.current.close();
				}

				// 新しいWebSocketインスタンスを作成
				const ws = new WebSocket(wsUrl);
				wsRef.current = ws;

				// イベントハンドラを設定
				ws.onopen = () => {
					connectionManager.handleOpen();
				};

				ws.onclose = (event) => {
					connectionManager.handleClose(event);
				};

				ws.onerror = (event) => {
					connectionManager.handleError(event);
				};

				ws.onmessage = customHandleMessage;
			} catch (error) {
				console.error("WebSocket接続エラー:", error);
				setState((prev) => ({
					...prev,
					status: ConnectionStatus.ERROR,
					error: `WebSocketインスタンスの作成に失敗しました: ${
						error instanceof Error ? error.message : String(error)
					}`,
				}));
			}
		},
		[customHandleMessage], // connectionManagerは循環参照のため依存配列から除外
	);

	// WebSocketインスタンスの閉鎖
	const closeWebSocketInstance = useCallback(
		(code?: number, reason?: string) => {
			if (wsRef.current) {
				try {
					wsRef.current.close(code, reason);
				} catch (error) {
					console.error("WebSocket切断エラー:", error);
				} finally {
					wsRef.current = null;
				}
			}
		},
		[],
	);

	// 接続マネージャーの取得
	const connectionManager = useWebSocketConnectionManager({
		wsRef,
		state,
		setState,
		connectWebSocketInstance,
		closeWebSocketInstance,
	});

	// 循環参照を解決するためにconnectWebSocketInstanceを更新
	useEffect(() => {
		const originalConnectInstance = connectWebSocketInstance;
		const wrappedConnectInstance = (wsUrl: string) => {
			try {
				originalConnectInstance(wsUrl);
			} catch (error) {
				console.error("接続エラー:", error);
			}
		};

		// 必要に応じてここでconnectionManagerのconnectWebSocketInstanceを更新
	}, [connectWebSocketInstance]);

	// Ping送信の定期実行
	useEffect(() => {
		let pingInterval: NodeJS.Timeout | null = null;

		// 接続中の場合のみPingを送信
		if (state.status === ConnectionStatus.CONNECTED && wsRef.current) {
			pingInterval = setInterval(() => {
				if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
					try {
						const pingMessage = {
							type: MessageType.PING,
							timestamp: Date.now(),
						};
						wsRef.current.send(JSON.stringify(pingMessage));
					} catch (error) {
						console.error("Ping送信エラー:", error);
					}
				}
			}, 30000); // 30秒ごとにPing
		}

		// クリーンアップ関数
		return () => {
			if (pingInterval) {
				clearInterval(pingInterval);
			}
		};
	}, [state.status]);

	// 自動接続処理
	useEffect(() => {
		if (autoConnect && url && state.status === ConnectionStatus.DISCONNECTED) {
			connectionManager.connect(url);
		}
	}, [autoConnect, url, state.status, connectionManager]);

	// urlが変更された場合に再接続
	useEffect(() => {
		if (url && wsRef.current && connectionManager) {
			// まず現在の接続を切断
			connectionManager.disconnect();
			// 少し待ってから再接続
			const timer = setTimeout(() => {
				connectionManager.connect(url);
			}, 500);
			return () => clearTimeout(timer);
		}
	}, [url, connectionManager]);

	// WebSocketアクション
	const actions = useMemo(() => {
		return {
			// 接続系
			connect: connectionManager.connect,
			disconnect: connectionManager.disconnect,
			// メッセージ送受信系
			sendChatMessage: standardMessageHandler.sendChatMessage,
			sendSuperchatMessage: standardMessageHandler.sendSuperchatMessage,
			// 過去ログ取得
			requestHistory: (limit = 50) => {
				if (
					!wsRef.current ||
					wsRef.current.readyState !== WebSocket.OPEN ||
					state.isLoadingHistory
				) {
					console.warn("過去ログリクエスト送信不可:", {
						connected:
							!!wsRef.current && wsRef.current.readyState === WebSocket.OPEN,
						isLoading: state.isLoadingHistory,
					});
					return;
				}

				try {
					// ローディング状態に設定
					setState((prev) => ({
						...prev,
						isLoadingHistory: true,
						historyError: null,
					}));

					const request = {
						type: MessageType.GET_HISTORY,
						limit: Math.min(Math.max(1, limit), 200), // 1～200の範囲に制限
						before_timestamp: state.oldestMessageTimestamp,
					};

					console.debug("過去ログリクエスト送信:", request);
					wsRef.current.send(JSON.stringify(request));
				} catch (error) {
					console.error("過去ログリクエスト送信エラー:", error);
					setState((prev) => ({
						...prev,
						isLoadingHistory: false,
						historyError: `過去ログの取得に失敗しました: ${
							error instanceof Error ? error.message : String(error)
						}`,
					}));
					toast.error("過去ログの取得に失敗しました");
				}
			},
		};
	}, [
		connectionManager,
		standardMessageHandler,
		state.isLoadingHistory,
		state.oldestMessageTimestamp,
	]);

	// コンテキスト値
	const contextValue = useMemo<WebSocketContextType>(
		() => ({
			state,
			actions,
		}),
		[state, actions],
	);

	return (
		<WebSocketContext.Provider value={contextValue}>
			{children}
		</WebSocketContext.Provider>
	);
}

/**
 * WebSocketコンテキストを使用するためのカスタムフック
 *
 * @returns WebSocketの状態とアクション
 * @throws Error コンテキストがプロバイダーの外部で使用された場合
 */
export function useWebSocket(): WebSocketContextType {
	const context = useContext(WebSocketContext);
	if (context === undefined) {
		throw new Error("useWebSocket must be used within a WebSocketProvider");
	}
	return context;
}
