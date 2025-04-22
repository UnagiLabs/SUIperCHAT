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

/**
 * WebSocketコンテキスト
 * アプリケーション全体でWebSocketの状態と操作を共有するために使用
 */
const WebSocketContext = createContext<WebSocketContextType | undefined>(
	undefined,
);

/**
 * WebSocketプロバイダーコンポーネント
 * 状態管理とWebSocketインスタンス管理、コンテキスト提供を行う
 */
export function WebSocketProvider({ children }: React.PropsWithChildren) {
	const [state, setState] = useState<WebSocketState>({
		status: ConnectionStatus.DISCONNECTED,
		url: null,
		error: null,
		retryCount: 0,
		messages: [],
	});
	const wsRef = useRef<WebSocket | null>(null);

	// --- WebSocketインスタンスの生成と破棄 ---
	const connectWebSocketInstance = useCallback(
		(url: string) => {
			// 既存のインスタンスがあれば閉じる（念のため）
			if (wsRef.current) {
				console.warn(
					"既存のWebSocketインスタンスを閉じてから新規作成します (Provider)",
				);
				wsRef.current.onopen = null;
				wsRef.current.onmessage = null;
				wsRef.current.onerror = null;
				wsRef.current.onclose = null;
				wsRef.current.close();
				wsRef.current = null;
			}

			try {
				console.log("WebSocketインスタンス作成開始 (Provider):", url);
				const newWs = new WebSocket(url);
				console.log("WebSocketインスタンス作成完了 (Provider)");

				// イベントハンドラをフックのハンドラに紐付け
				// 注意: フックのハンドラはuseCallbackでメモ化されている必要がある
				newWs.onopen = () => connectionManager.handleOpen();
				newWs.onmessage = (event) => messageHandler.handleMessage(event);
				newWs.onerror = (event) => connectionManager.handleError(event);
				newWs.onclose = (event) => {
					connectionManager.handleClose(event);
					// クリーンアップ後に参照をnullにする
					wsRef.current = null;
					console.log("WebSocketインスタンス参照をクリア (Provider onclose)");
				};

				wsRef.current = newWs;
				console.log("イベントハンドラ設定完了 (Provider)");
			} catch (error) {
				const errorMsg = `WebSocketインスタンス作成失敗 (Provider): ${error instanceof Error ? error.message : String(error)}`;
				console.error(errorMsg, error);
				// 状態更新はconnectionManagerが行う
				setState((prev) => ({
					...prev,
					status: ConnectionStatus.ERROR,
					error: errorMsg,
				}));
				// 必要であれば再接続試行をトリガー？ (connectionManagerに任せる)
				// connectionManager.attemptReconnect(); // これは避けるべきか？ handleClose経由でトリガーされるはず
			}
		},
		// setStateは安定しているので依存配列から除外 (linter指摘対応)
		// フックのハンドラへの依存は useEffect で解決
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			/* setState */
			/* connectionManager, messageHandler が初期化されるまで待つ */
		],
	);

	const closeWebSocketInstance = useCallback(
		(code?: number, reason?: string) => {
			if (wsRef.current) {
				console.log("WebSocketインスタンス閉鎖開始 (Provider):", {
					code,
					reason,
				});
				// oncloseハンドラが呼ばれる前にハンドラを削除しないこと
				// wsRef.current.onopen = null;
				// wsRef.current.onmessage = null;
				// wsRef.current.onerror = null;
				// wsRef.current.onclose = null; // onclose内でwsRef.current=nullするので、ここでは削除しない
				wsRef.current.close(code, reason);
				// wsRef.current = null; // oncloseハンドラでクリアする
			} else {
				console.debug("閉鎖するWebSocketインスタンスなし (Provider)");
			}
		},
		[
			/* wsRef is stable */
		], // wsRefは安定しているので依存配列から除外 (linter指摘対応)
	);

	// --- カスタムフックの利用 ---
	// 状態更新関数 (ログ付き) - connectionManagerとmessageHandlerに渡す
	const updateStatus = useCallback(
		(status: ConnectionStatus, error: string | null = null) => {
			setState((prev) => {
				const newError =
					error === null ? null : error !== prev.error ? error : prev.error;
				if (prev.status === status && prev.error === newError) return prev;

				const newState = { ...prev, status, error: newError };
				// ログ
				if (error && error !== prev.error)
					console.warn(`WebSocket状態更新(Provider): ${status}`, error);
				else if (!error && prev.error)
					console.debug(
						`WebSocket状態更新(Provider): ${status} (エラークリア)`,
					);
				else if (prev.status !== status)
					console.debug(`WebSocket状態更新(Provider): ${status}`);

				return newState;
			});
		},
		[
			/* setState is stable */
		], // setStateは安定しているので依存配列から除外 (linter指摘対応)
	);

	const connectionManager = useWebSocketConnectionManager({
		wsRef,
		state, // 現在の状態を渡す
		setState, // 状態更新関数を渡す
		connectWebSocketInstance, // インスタンス生成関数を渡す
		closeWebSocketInstance, // インスタンス閉鎖関数を渡す
	});

	const messageHandler = useWebSocketMessageHandler({
		wsRef,
		setState, // 状態更新関数を渡す
		updateStatus, // 接続フックから取れないため、ProviderのupdateStatusを渡す
	});

	// --- WebSocketインスタンス生成時のコールバック依存性解決 ---
	// connectWebSocketInstanceがconnectionManagerとmessageHandlerに依存するため、
	// それらが初期化された後にconnectWebSocketInstanceを再生成するuseEffectを追加
	const memoizedConnectWebSocketInstance = useRef(connectWebSocketInstance);
	useEffect(() => {
		memoizedConnectWebSocketInstance.current = (url: string) => {
			// 既存のインスタンスがあれば閉じる
			if (wsRef.current) {
				console.warn(
					"既存のWebSocketインスタンスを閉じてから新規作成します (Provider - Effect)",
				);
				// イベントハンドラをnullに設定してから閉じる
				wsRef.current.onopen = null;
				wsRef.current.onmessage = null;
				wsRef.current.onerror = null;
				wsRef.current.onclose = null;
				wsRef.current.close();
				wsRef.current = null;
			}
			try {
				console.log("WebSocketインスタンス作成開始 (Provider - Effect):", url);
				const newWs = new WebSocket(url);
				console.log("WebSocketインスタンス作成完了 (Provider - Effect)");
				// ここで最新のハンドラを設定
				newWs.onopen = () => connectionManager.handleOpen();
				newWs.onmessage = (event) => messageHandler.handleMessage(event);
				newWs.onerror = (event) => connectionManager.handleError(event);
				newWs.onclose = (event) => {
					connectionManager.handleClose(event);
					wsRef.current = null; // ここでクリア
					console.log(
						"WebSocketインスタンス参照をクリア (Provider onclose - Effect)",
					);
				};
				wsRef.current = newWs;
				console.log("イベントハンドラ設定完了 (Provider - Effect)");
			} catch (error) {
				const errorMsg = `WebSocketインスタンス作成失敗 (Provider-Effect): ${error instanceof Error ? error.message : String(error)}`;
				console.error(errorMsg, error);
				setState((prev) => ({
					...prev,
					status: ConnectionStatus.ERROR,
					error: errorMsg,
				}));
			}
		};
	}, [connectionManager, messageHandler /* setState is stable */]); // setStateは安定しているので依存配列から除外 (linter指摘対応)

	// connectionManagerに最新のインスタンス生成関数を渡すための更新
	// ※ これは少しトリッキーかもしれない。useWebSocketConnectionManagerの引数を更新する必要がある。
	//   より良い方法は、Provider内でconnect/disconnectアクションを定義し、
	//   その内部でインスタンス生成/破棄とフックのアクション呼び出しを行うことかもしれない。
	//   => 今回は connectionManager の引数を更新するアプローチを試す。

	// --- コンテキストに渡す値 ---
	const contextValue = useMemo<WebSocketContextType>(
		() => ({
			state,
			actions: {
				// connectionManager と messageHandler から公開されているアクションを渡す
				connect: connectionManager.connect,
				disconnect: connectionManager.disconnect,
				sendChatMessage: messageHandler.sendChatMessage,
				sendSuperchatMessage: messageHandler.sendSuperchatMessage,
			},
			// connectionManagerとmessageHandlerのインスタンスも依存配列に入れる
		}),
		[state, connectionManager, messageHandler],
	);

	// --- アンマウント時のクリーンアップ ---
	// useWebSocketConnect フック内で useEffect を使用してアンマウント時の disconnect を呼び出すため、
	// Provider 側での useEffect による disconnect 呼び出しは不要になる。
	// useEffect(() => {
	// 	return () => {
	// 		console.log("WebSocketProvider unmounting, calling disconnect...");
	// 		// disconnect関数は connectionManager から取得したものを使う
	// 		connectionManager.disconnect();
	// 	};
	// }, [connectionManager]); // connectionManagerインスタンスに依存

	return (
		<WebSocketContext.Provider value={contextValue}>
			{children}
		</WebSocketContext.Provider>
	);
}

/**
 * WebSocketコンテキストを使用するためのカスタムフック
 * コンテキストが未定義の場合にエラーをスローする
 */
export function useWebSocket() {
	const context = useContext(WebSocketContext);
	if (context === undefined) {
		throw new Error("useWebSocket must be used within a WebSocketProvider");
	}
	return context;
}
