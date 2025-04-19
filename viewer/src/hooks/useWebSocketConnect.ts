/**
 * WebSocket接続管理フック
 *
 * @module hooks/useWebSocketConnect
 */
import {
	useCallback,
	useRef,
	useEffect,
	type MutableRefObject,
	type Dispatch,
	type SetStateAction,
} from "react";
import {
	ConnectionStatus,
	type WebSocketState,
	// type WebSocketContextType, // Provider側で定義されるため不要になる想定
} from "@/lib/types/websocket";
// useWebSocketはProviderを参照するため、Providerの修正後にimportを有効化
import { useWebSocket } from "@/components/providers/WebSocketProvider";

// --- 定数 ---
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000; // ms
const ERROR_SUPPRESSION_TIME = 2000; // 接続成功後のエラー抑制時間(ms)

// --- 内部的な接続管理ロジックフック ---
interface UseWebSocketConnectionManagerOptions {
	wsRef: MutableRefObject<WebSocket | null>;
	state: WebSocketState; // Providerのstate全体 (読み取り専用)
	setState: Dispatch<SetStateAction<WebSocketState>>; // ProviderのsetState
	connectWebSocketInstance: (url: string) => void; // Provider側のWebSocketインスタンス生成処理
	closeWebSocketInstance: (code?: number, reason?: string) => void; // Provider側のWebSocketインスタンス閉鎖処理
}

/**
 * WebSocketの接続、切断、再接続のコアロジックを管理する内部フック
 * Providerから状態とインスタンス操作関数を受け取る
 */
export function useWebSocketConnectionManager({
	wsRef,
	state,
	setState,
	connectWebSocketInstance,
	closeWebSocketInstance,
}: UseWebSocketConnectionManagerOptions) {
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const connectedAtRef = useRef<number | null>(null);

	// 状態更新関数 (ProviderのsetStateをラップし、ログ追加)
	const updateStatus = useCallback(
		(status: ConnectionStatus, error: string | null = null) => {
			setState((prev) => {
				// エラーメッセージが同じ場合は更新しない（無限ループ防止）
				// nullが指定された場合は常にnullに更新
				const newError =
					error === null ? null : error !== prev.error ? error : prev.error;

				// 状態が同じなら更新しない
				if (prev.status === status && prev.error === newError) {
					return prev;
				}

				const newState = {
					...prev,
					status,
					error: newError,
				};

				// ログ出力
				if (error && error !== prev.error) { // エラー内容が変化した場合のみログ出力
					console.warn(`WebSocket状態更新(hook): ${status}`, error);
				} else if (!error && prev.error) { // エラーがクリアされた場合
					console.debug(`WebSocket状態更新(hook): ${status} (エラークリア)`);
				} else if (prev.status !== status) { // ステータスのみ変化した場合
					console.debug(`WebSocket状態更新(hook): ${status}`);
				}

				return newState;
			});
		},
		[setState],
	);

	// 再接続試行ロジック
	const attemptReconnect = useCallback(() => {
		if (
			reconnectTimeoutRef.current ||
			!state.url ||
			state.status === ConnectionStatus.CONNECTING ||
			state.status === ConnectionStatus.CONNECTED ||
			state.status === ConnectionStatus.RECONNECTING ||
			state.status === ConnectionStatus.DISCONNECTING ||
			state.retryCount >= MAX_RECONNECT_ATTEMPTS
		) {
			return;
		}

		updateStatus(ConnectionStatus.RECONNECTING);

		const retryCount = state.retryCount + 1;
		const isLastAttempt = retryCount >= MAX_RECONNECT_ATTEMPTS;

		if (isLastAttempt) {
			updateStatus(
				ConnectionStatus.RECONNECTING,
				`最終接続試行中 (${retryCount}/${MAX_RECONNECT_ATTEMPTS})`,
			);
		} else {
			updateStatus(ConnectionStatus.RECONNECTING, null); // エラーリセット
		}

		console.debug("WebSocket再接続試行:", {
			attempt: retryCount,
			maxAttempts: MAX_RECONNECT_ATTEMPTS,
			url: state.url,
			delay: RECONNECT_INTERVAL,
		});

		reconnectTimeoutRef.current = setTimeout(() => {
			// 再接続試行前にリトライカウントを増やす
			setState((prev) => ({ ...prev, retryCount: prev.retryCount + 1 }));
			if (state.url) {
				// Provider側のインスタンス生成処理を呼び出す
				connectWebSocketInstance(state.url);
			}
			reconnectTimeoutRef.current = null;
		}, RECONNECT_INTERVAL);
	}, [
		state.url,
		state.status,
		state.retryCount,
		updateStatus,
		setState,
		connectWebSocketInstance, // Provider側の関数への依存
	]);

	// 接続開始ロジック (検証と状態更新)
	const connect = useCallback(
		(url: string) => {
			console.log("Connect logic called in hook:", { url });

			// URL検証
			if (!url || !url.trim()) {
				updateStatus(ConnectionStatus.ERROR, "WebSocket URLが空です");
				return false;
			}
			if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
				updateStatus(
					ConnectionStatus.ERROR,
					`WebSocket URLは 'ws://' または 'wss://' で始まる必要があります: ${url}`,
				);
				return false;
			}
			if (!url.includes("/ws")) {
				console.warn(`URL '${url}' に '/ws' パスが含まれていない可能性あり`);
			}

			// 既存接続チェック
			if (wsRef.current) {
				const currentState = wsRef.current.readyState;
				if (
					currentState === WebSocket.CONNECTING ||
					currentState === WebSocket.OPEN
				) {
					console.warn("WebSocketは既に接続中または接続済み (hook check)", {
						url: wsRef.current.url, readyState: currentState, status: state.status
					});
					// すでに接続済みなら何もしない (エラーでも成功でもない)
					return false; // 新規接続は開始しない
				}
				if (currentState === WebSocket.CLOSING) {
					console.warn("WebSocketは切断処理中です (hook check)");
					return false; // 接続開始しない
				}
				// CLOSEDの場合は続行 (Provider側でインスタンス再作成)
			}

			// 再接続タイマーをクリア
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
				console.debug("Reconnect timer cleared by connect action (hook)");
			}

			// 状態を接続中に更新 & URL保存 & リセット
			updateStatus(ConnectionStatus.CONNECTING);
			setState((prev) => ({ ...prev, url, retryCount: 0, error: null }));
			console.log("WebSocket接続プロセス開始 (hook update)");

			// Provider側にインスタンス生成を依頼
			connectWebSocketInstance(url);
			return true; // 接続プロセス開始成功
		},
		[updateStatus, setState, wsRef, state.status, connectWebSocketInstance],
	);

	// 切断開始ロジック (検証と状態更新)
	const disconnect = useCallback(() => {
		console.log("Disconnect logic called in hook");
		// WebSocketがない、または既に閉じている/閉じている最中なら何もしない
		if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED || wsRef.current.readyState === WebSocket.CLOSING) {
			console.debug("No active/open WebSocket connection to disconnect or already closing/closed (hook check)");
			// 状態が既にDISCONNECTEDでなければ更新
			if (state.status !== ConnectionStatus.DISCONNECTED) {
				updateStatus(ConnectionStatus.DISCONNECTED);
			}
			return false; // 切断処理不要
		}

		// 再接続タイマーをクリア
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
			console.debug("Reconnect timer cleared by disconnect action (hook)");
		}

		updateStatus(ConnectionStatus.DISCONNECTING);
		console.log("WebSocket切断プロセス開始 (hook update)");

		// Provider側にインスタンス閉鎖を依頼 (正常終了コード)
		closeWebSocketInstance(1000, "User disconnected");
		return true; // 切断プロセス開始成功
	}, [updateStatus, wsRef, state.status, closeWebSocketInstance]);

	// --- WebSocketイベントハンドラ用ロジック --- (Providerから呼び出される)
	const handleOpen = useCallback(() => {
		connectedAtRef.current = Date.now();
		console.log("WebSocket opened (handled by hook)");
		updateStatus(ConnectionStatus.CONNECTED);
		// 接続成功時にリトライカウントとエラーをリセット
		setState((prev) => ({ ...prev, retryCount: 0, error: null }));
	}, [updateStatus, setState]);

	const handleError = useCallback(
		(event: Event) => {
			const connectionTime = connectedAtRef.current;
			const isRecentConnection =
				connectionTime && Date.now() - connectionTime < ERROR_SUPPRESSION_TIME;
			const wsState = wsRef.current?.readyState;

			// 接続済み、または接続直後のエラーは無視
			if (state.status === ConnectionStatus.CONNECTED || isRecentConnection) {
				console.debug("WebSocketエラーイベント無視 (handled by hook)", {
					isConnected: state.status === ConnectionStatus.CONNECTED,
					isRecent: isRecentConnection, wsState, eventType: event.type,
				});
				return;
			}

			const errorMsg = "WebSocketサーバーに接続できませんでした";
			console.error("WebSocket error (handled by hook)", { eventType: event.type, wsState });
			// エラー状態にしつつ、再接続を試みる
			updateStatus(ConnectionStatus.ERROR, errorMsg);
			// attemptReconnectは次のレンダリングサイクルで最新のstateを見るようにする
			// もしくは、attemptReconnect内でstatusを再チェックしているのでそのままでも良い
			attemptReconnect();
		},
		[updateStatus, state.status, attemptReconnect, wsRef],
	);

	const handleClose = useCallback(
		(event: CloseEvent) => {
			const closeDetails = { code: event.code, reason: event.reason, wasClean: event.wasClean, statusBeforeClose: state.status };
			console.log("WebSocket closed (handled by hook)", closeDetails);

			connectedAtRef.current = null; // 接続時刻リセット

			// 意図しない切断の場合、再接続を試みる
			// (ただし、Provider側で切断処理中の場合は再接続しない)
			if (!event.wasClean && state.status !== ConnectionStatus.DISCONNECTING) {
				let disconnectReason = "接続が切断されました";
				if (event.code === 1006) { // 異常切断
					disconnectReason = "配信サーバーとの接続が異常切断されました。再接続試行中...";
				}
				updateStatus(ConnectionStatus.DISCONNECTED, disconnectReason);
				attemptReconnect();
			} else {
				// 意図的な切断 or 再接続上限 or すでに切断済み
				let finalReason: string | null = null;
				// 再接続上限に達し、かつ意図的な切断ではない場合
				if (state.retryCount >= MAX_RECONNECT_ATTEMPTS && state.status !== ConnectionStatus.DISCONNECTING) {
					finalReason = "配信サーバーへの再接続上限に達しました。";
					console.warn("WebSocket再接続上限到達 (handled by hook)");
				} else if (state.status === ConnectionStatus.DISCONNECTING) {
					console.log("WebSocket意図的に切断完了 (handled by hook)");
				}
				// 最終的な状態をDISCONNECTEDに設定
				updateStatus(ConnectionStatus.DISCONNECTED, finalReason);
				// 接続が完全に終わったのでリトライカウントをリセットしても良いかもしれない
				// setState((prev) => ({ ...prev, retryCount: 0 }));
			}
		},
		[updateStatus, state.status, state.retryCount, attemptReconnect],
	);

	// 外部向けに公開する関数と状態 (Providerが利用する)
	return {
		connect,
		disconnect,
		handleOpen,
		handleError,
		handleClose,
		// reconnectTimeoutRef, // Providerからは直接触らない想定
		// connectedAtRef,     // Providerからは直接触らない想定
	};
}

// --- 外部向けフック ---
interface UseWebSocketConnectOptions {
	/** 自動接続するかどうか @default true */
	autoConnect?: boolean;
	/** WebSocketのURL */
	url?: string;
	/** 接続状態が変化したときに呼び出されるコールバック */
	onStatusChange?: (status: ConnectionStatus) => void;
	/** エラーが発生したときに呼び出されるコールバック */
	onError?: (error: string | null) => void;
}

/**
 * WebSocket接続を管理するためのカスタムフック (外部向けAPI)
 * Providerから状態と接続/切断アクションを取得し、自動接続やコールバック機能を提供する
 */
export function useWebSocketConnect({
	autoConnect = true,
	url,
	onStatusChange,
	onError,
}: UseWebSocketConnectOptions = {}) {
	// Providerから状態とアクションを取得 (Provider修正後に有効化)
	const { state, actions } = useWebSocket();

	// 自動接続とアンマウント時の切断
	useEffect(() => {
		// autoConnectが有効、URLがあり、connectアクションが存在する場合
		if (autoConnect && url && actions.connect) {
			// まだ接続中でない、または接続済みでない場合のみ接続試行
			if (state.status !== ConnectionStatus.CONNECTED && state.status !== ConnectionStatus.CONNECTING) {
				console.log("Auto-connecting from useWebSocketConnect:", url);
				actions.connect(url);
				// isConnectedByHook = true; // 未使用のため削除
			}
		}

		// クリーンアップ関数
		return () => {
			// コンポーネントがアンマウントされたら切断を試みる
			// (他のコンポーネントがまだ接続を使っている可能性もあるため、慎重な設計が必要だが、
			//  現状のProviderの実装を踏襲し、アンマウント時にdisconnectを呼ぶ)
			if (actions.disconnect) {
				console.log("Disconnecting on unmount from useWebSocketConnect");
				// disconnectアクションを呼び出す
				actions.disconnect();
			}
		};
		// 依存配列: autoConnect, url, actions.connect, actions.disconnect, state.status
		// state.status を依存配列に追加 (linter指摘対応)
	}, [autoConnect, url, actions, state.status]); // actions全体を依存配列に追加

	// 状態変化とエラーの外部コールバック呼び出し
	useEffect(() => {
		if (onStatusChange) {
			onStatusChange(state.status);
		}
	}, [onStatusChange, state.status]);

	useEffect(() => {
		if (onError) {
			onError(state.error);
		}
	}, [onError, state.error]);

	// Providerから取得した状態とアクションを返す
	return {
		status: state.status,
		isConnected: state.status === ConnectionStatus.CONNECTED,
		isConnecting:
			state.status === ConnectionStatus.CONNECTING ||
			state.status === ConnectionStatus.RECONNECTING,
		isDisconnected: state.status === ConnectionStatus.DISCONNECTED,
		error: state.error,
		retryCount: state.retryCount,
		connect: actions.connect, // Providerのアクションをそのまま公開
		disconnect: actions.disconnect, // Providerのアクションをそのまま公開
	};
}
