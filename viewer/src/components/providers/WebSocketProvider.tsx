/**
 * WebSocketプロバイダー
 * チャットやスーパーチャットの送受信を管理するWebSocketコンテキストを提供する
 *
 * @file WebSocketプロバイダーの実装
 */
"use client";

import {
	type ChatMessage,
	ConnectionStatus,
	type SuperchatData,
	type SuperchatMessage,
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

// --- 定数 --- (TODO: 設定ファイルなどに移動)
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000; // ms
const ERROR_SUPPRESSION_TIME = 2000; // 接続成功後のエラー抑制時間(ms)

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
	// 接続成功からの経過時間を追跡するための参照
	const connected_at_ref = useRef<number | null>(null);

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
			// エラー状態の場合はコンソールにログ出力
			if (error) {
				console.warn(`WebSocket状態更新: ${status}`, error);
			} else {
				console.debug(`WebSocket状態更新: ${status}`);
			}
		},
		[],
	);

	/**
	 * 再接続を試みる関数
	 */
	const attempt_reconnect = useCallback(() => {
		// 既に再接続処理が進行中、または再接続不可能な場合は何もしない
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

		// 再接続状態に更新
		update_status(ConnectionStatus.RECONNECTING);

		// 再接続試行回数に応じた情報を表示
		const retry_count = state.retryCount + 1;
		const is_last_attempt = retry_count >= MAX_RECONNECT_ATTEMPTS;

		// 最終試行または中間試行でユーザーに適切な情報を表示
		if (is_last_attempt) {
			// 最後の再接続試行の場合、より明確なメッセージを状態に保存
			update_status(
				ConnectionStatus.RECONNECTING,
				`最終接続試行中 (${retry_count}/${MAX_RECONNECT_ATTEMPTS})`,
			);
		} else {
			// 通常の再接続試行はエラーメッセージなしで状態のみ更新
			update_status(ConnectionStatus.RECONNECTING);
		}

		// デバッグ情報はコンソールにのみ出力
		console.debug("WebSocket再接続試行:", {
			attempt: retry_count,
			maxAttempts: MAX_RECONNECT_ATTEMPTS,
			url: state.url,
			delay: RECONNECT_INTERVAL,
		});

		// 再接続タイマーを設定
		reconnect_timeout_ref.current = setTimeout(() => {
			set_state((prev) => ({ ...prev, retryCount: prev.retryCount + 1 }));
			connect_ref.current(state.url as string);
			reconnect_timeout_ref.current = null;
		}, RECONNECT_INTERVAL);
	}, [state.url, state.status, state.retryCount, update_status]);

	/**
	 * WebSocket接続を開く関数
	 * @param {string} url - 接続先WebSocketサーバーのURL
	 */
	const connect = useCallback(
		(url: string) => {
			// 接続開始のログ
			console.log("WebSocket接続開始:", {
				url,
				currentState: state.status,
				timestamp: new Date().toISOString(),
			});

			// URLの検証
			if (!url || !url.trim()) {
				const error_msg = "WebSocket URLが空です";
				console.error(error_msg);
				update_status(ConnectionStatus.ERROR, error_msg);
				return;
			}

			// プロトコルチェック
			if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
				const error_msg = `WebSocket URLは 'ws://' または 'wss://' で始まる必要があります: ${url}`;
				console.error(error_msg);
				update_status(ConnectionStatus.ERROR, error_msg);
				return;
			}

			// WebSocketのパスが含まれているか確認
			if (!url.includes("/ws")) {
				console.warn(
					`URL '${url}' に '/ws' パスが含まれていない可能性があります。`,
				);
			}

			// 既に接続中または接続状態の場合は処理をスキップ
			if (ws_ref.current) {
				const current_state = ws_ref.current.readyState;
				if (
					current_state === WebSocket.CONNECTING ||
					current_state === WebSocket.OPEN
				) {
					console.warn("WebSocketは既に接続中または接続済みです", {
						url: ws_ref.current.url,
						readyState: current_state,
						status: state.status,
					});
					return;
				}

				if (current_state === WebSocket.CLOSING) {
					console.warn("WebSocketは切断処理中です。切断完了後に再接続します");
					// 切断完了を待つため、現在の接続は維持
					return;
				}

				// CLOSED状態の場合は新しい接続を作成するため、現在の参照をクリア
				ws_ref.current = null;
			}

			// 既存の再接続タイマーをクリア
			if (reconnect_timeout_ref.current) {
				clearTimeout(reconnect_timeout_ref.current);
				reconnect_timeout_ref.current = null;
			}

			// 状態を接続中に更新
			update_status(ConnectionStatus.CONNECTING);
			set_state((prev) => ({ ...prev, url })); // URL を保存

			try {
				// URLが有効かどうかを事前検証
				let parsed_url: URL;
				try {
					parsed_url = new URL(url);
					console.log("WebSocket URL検証成功:", {
						protocol: parsed_url.protocol,
						host: parsed_url.host,
						pathname: parsed_url.pathname,
					});
				} catch (urlError) {
					throw new Error(`無効なWebSocket URL: ${url} - ${urlError}`);
				}

				// WebSocketインスタンス作成
				console.log("WebSocketインスタンス作成中...");
				ws_ref.current = new WebSocket(url);
				console.log(
					"WebSocketインスタンス作成完了、イベントハンドラーを設定中",
				);

				// この時点でエラーがなければ接続プロセスは継続中
				console.log("WebSocket接続処理が正常に開始されました");

				ws_ref.current.onopen = () => {
					// 接続成功時刻を記録
					connected_at_ref.current = Date.now();

					// 接続成功のログを出力
					console.log("WebSocket接続が正常に開かれました", {
						url: ws_ref.current ? ws_ref.current.url : "unknown",
						readyState: ws_ref.current ? ws_ref.current.readyState : "unknown",
						protocol: ws_ref.current ? ws_ref.current.protocol : "unknown",
						timestamp: new Date().toISOString(),
					});

					// 状態を更新
					update_status(ConnectionStatus.CONNECTED);
					set_state((prev) => ({ ...prev, retryCount: 0, error: null })); // 接続成功時にリトライカウントとエラーをリセット

					// 接続成功後に初期化メッセージを送信（オプション）
					// 接続成功後に初期化メッセージを送信（オプション）
					// サーバー側で 'init' メッセージタイプが ClientMessage enum に定義されていないため、パースエラーになる問題を回避
					console.log("Debug: Init message sending commented out."); // ★追加★
				};

				ws_ref.current.onmessage = (event) => {
					console.log(
						"WebSocketメッセージ受信:",
						event.data.substring(0, 100) +
							(event.data.length > 100 ? "..." : ""),
					);
					try {
						// 受信データが空の場合は無視
						if (!event.data) {
							console.warn("空のWebSocketメッセージを受信しました");
							return;
						}

						// 初期型は不明だが、パース後に適切な型に変換する
						let parsed_data: Record<string, unknown>;
						try {
							parsed_data = JSON.parse(event.data);
						} catch (parseError) {
							console.error(
								"WebSocketメッセージのJSON解析に失敗:",
								event.data,
								parseError,
							);
							update_status(state.status, "メッセージの解析に失敗しました");
							return;
						}

						// メッセージタイプの検証
						if (!parsed_data.type || typeof parsed_data.type !== "string") {
							console.error(
								"WebSocketメッセージにtypeフィールドがないか、文字列ではありません:",
								parsed_data,
							);
							return;
						}

						const message_type = parsed_data.type as string;

						// サーバーからの PING/PONG は Rust 側で処理されるため、ここでは主にメッセージを処理
						if (
							message_type === MessageType.CHAT ||
							message_type === MessageType.SUPERCHAT
						) {
							console.log(`${message_type}メッセージを処理中...`);

							// 型を安全に変換
							// チャットメッセージまたはスーパーチャットメッセージとして必要なフィールドを検証
							if (
								typeof parsed_data.display_name !== "string" ||
								typeof parsed_data.message !== "string" ||
								!parsed_data.id ||
								!parsed_data.timestamp
							) {
								console.error(
									"WebSocketメッセージに必要なフィールドがありません:",
									parsed_data,
								);
								return;
							}

							// 基本メッセージ構造の作成
							const base_message: Partial<ChatMessage | SuperchatMessage> = {
								type: message_type as MessageType.CHAT | MessageType.SUPERCHAT,
								display_name: parsed_data.display_name as string,
								message: parsed_data.message as string,
								id: parsed_data.id as string,
								timestamp: Number(parsed_data.timestamp),
							};

							// スーパーチャットの場合は追加フィールドを検証
							if (message_type === MessageType.SUPERCHAT) {
								if (
									!parsed_data.superchat ||
									typeof parsed_data.superchat !== "object" ||
									typeof (parsed_data.superchat as Record<string, unknown>)
										.amount !== "number" ||
									typeof (parsed_data.superchat as Record<string, unknown>)
										.tx_hash !== "string" ||
									typeof (parsed_data.superchat as Record<string, unknown>)
										.wallet_address !== "string"
								) {
									console.error(
										"スーパーチャットメッセージに必要なフィールドがありません:",
										parsed_data,
									);
									return;
								}

								// スーパーチャット情報を追加
								(base_message as Partial<SuperchatMessage>).superchat = {
									amount: (parsed_data.superchat as Record<string, unknown>)
										.amount as number,
									tx_hash: (parsed_data.superchat as Record<string, unknown>)
										.tx_hash as string,
									wallet_address: (
										parsed_data.superchat as Record<string, unknown>
									).wallet_address as string,
								};
							}

							// 状態に追加
							set_state((prev) => {
								// 型を適切にキャストして追加
								const message =
									message_type === MessageType.CHAT
										? (base_message as ChatMessage)
										: (base_message as SuperchatMessage);

								const newMessages = [...prev.messages, message];
								console.log(
									`メッセージを状態に追加しました。現在のメッセージ数: ${newMessages.length}`,
								);
								return {
									...prev,
									messages: newMessages,
								};
							});
						} else if (message_type === MessageType.ERROR) {
							// エラーメッセージの処理
							if (typeof parsed_data.message === "string") {
								console.error(
									"サーバーからエラーメッセージを受信:",
									parsed_data.message,
								);
								// エラーメッセージを状態に保存
								update_status(
									state.status,
									`サーバーエラー: ${parsed_data.message}`,
								);
							} else {
								console.error(
									"サーバーからエラーメッセージを受信しましたが、メッセージフィールドが不正です:",
									parsed_data,
								);
								update_status(
									state.status,
									"サーバーから不正なエラーメッセージを受信しました",
								);
							}
						} else if (message_type === MessageType.CONNECTION_STATUS) {
							// 接続状態メッセージの処理
							console.log(
								"接続状態更新:",
								typeof parsed_data.status === "string"
									? parsed_data.status
									: "不明",
								parsed_data.info ? parsed_data.info : "",
							);
						} else if (
							message_type === MessageType.PING ||
							message_type === MessageType.PONG
						) {
							// PING/PONGは通常ログ出力しない
							console.debug(`${message_type}メッセージを受信`);
						} else {
							console.warn("未知のメッセージタイプを受信:", message_type);
						}
					} catch (parse_error) {
						console.error(
							"WebSocketメッセージ処理中にエラー発生:",
							parse_error,
						);
						update_status(state.status, "メッセージの処理に失敗しました");
					}
				};

				ws_ref.current.onerror = (event) => {
					// WebSocketの状態を確認
					const is_already_connected =
						state.status === ConnectionStatus.CONNECTED;
					const ws_status = ws_ref.current ? ws_ref.current.readyState : -1;

					// 接続直後の一時的なエラーを無視するための判定
					const connection_time = connected_at_ref.current;
					const is_recent_connection =
						connection_time &&
						Date.now() - connection_time < ERROR_SUPPRESSION_TIME;

					// 既に接続済み、または接続直後のエラーは無視
					if (is_already_connected || is_recent_connection) {
						console.debug("WebSocketエラーイベントを無視します", {
							isConnected: is_already_connected,
							isRecentConnection: is_recent_connection,
							timeSinceConnection: connection_time
								? Date.now() - connection_time
								: null,
							eventType: event.type,
							readyState: ws_status,
						});
						return; // エラー表示をせずに処理を終了
					}

					// エラーメッセージ
					const error_msg = "WebSocketサーバーに接続できませんでした";

					// 詳細なエラー情報をコンソールに表示（デバッグ用）
					console.debug("WebSocket接続イベント:", {
						errorEvent: event.type,
						readyState: ws_status,
						status: state.status,
						timestamp: new Date().toISOString(),
					});

					// 既に接続済みおよび再接続中の場合は状態を更新しない
					if (
						state.status !== ConnectionStatus.CONNECTED &&
						state.status !== ConnectionStatus.RECONNECTING
					) {
						// 状態を更新
						update_status(ConnectionStatus.ERROR, error_msg);

						// エラー発生時も再接続を試みる
						attempt_reconnect_ref.current();
					}
				};

				ws_ref.current.onclose = (event) => {
					// 接続終了情報を構造化して出力
					const close_details = {
						code: event.code,
						reason: event.reason || "理由なし",
						wasClean: event.wasClean,
						type: event.type,
						url: ws_ref.current?.url,
						currentState: state.status,
						timestamp: new Date().toISOString(),
					};

					// デバッグ用のログ（詳細情報）
					console.debug("WebSocket接続終了詳細:", close_details);

					// 意図しない切断の場合、再接続を試みる
					if (
						!event.wasClean &&
						state.status !== ConnectionStatus.DISCONNECTING
					) {
						// 状態を更新
						update_status(
							ConnectionStatus.DISCONNECTED,
							"接続が切断されました",
						);

						// 視聴者には必要最小限の情報を通知（コード1006は異常切断）
						if (event.code === 1006) {
							update_status(
								ConnectionStatus.DISCONNECTED,
								"配信サーバーとの接続が切断されました。再接続を試みています...",
							);
						}

						// 再接続試行
						attempt_reconnect_ref.current();
					} else {
						// 意図的な切断 or 再接続上限
						update_status(ConnectionStatus.DISCONNECTED);

						// 再接続上限に達した場合のみユーザーに通知
						if (state.retryCount >= MAX_RECONNECT_ATTEMPTS) {
							update_status(
								ConnectionStatus.DISCONNECTED,
								"配信サーバーに接続できませんでした。ページを再読み込みするか、後ほど再度お試しください。",
							);
							console.warn("WebSocket再接続上限に達しました", {
								retryCount: state.retryCount,
								maxRetries: MAX_RECONNECT_ATTEMPTS,
							});
						}
					}

					// 接続成功時刻をリセット
					connected_at_ref.current = null;

					// WebSocketインスタンスをクリア
					ws_ref.current = null;
				};
			} catch (error) {
				const error_msg = `WebSocket 接続の初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`;
				console.error(error_msg);
				update_status(ConnectionStatus.ERROR, error_msg);
				// 初期化失敗時もリトライ
				attempt_reconnect_ref.current();
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
	const send_message = useCallback(
		(message_data: Record<string, unknown>) => {
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
					update_status(state.status, "メッセージの送信に失敗しました");
				}
			} else {
				console.warn("WebSocket is not connected. Cannot send message.");
			}
		},
		[state.status, update_status],
	);

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
		console.log("Debug: Cleanup useEffect started."); // ★追加★
		return () => {
			console.log("Debug: Cleanup useEffect cleanup started."); // ★追加★
			disconnect();
			console.log("Debug: Cleanup useEffect cleanup finished."); // ★追加★
		};
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
 */
export function useWebSocket() {
	const context = useContext(WebSocketContext);
	if (context === undefined) {
		throw new Error("useWebSocket must be used within a WebSocketProvider");
	}
	return context;
}
