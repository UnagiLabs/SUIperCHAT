/**
 * SUIperCHAT OBS表示用JavaScriptファイル (v1.0.8)
 *
 * WebSocketでスーパーチャットメッセージを受信し、OBS画面に表示する機能を実装します。
 * URLパラメータからWebSocketのアドレスを取得し、自動的に接続します。
 * YouTubeライクな表示スタイルに対応するためのDOM構造を生成します。
 * 異なるコイン種別に対応しています。
 * 過去のメッセージ履歴の取得・表示機能を含みます。
 */

// グローバル変数
let socket = null;
let reconnectTimeout = null;
const reconnectInterval = 5000; // 再接続間隔（ミリ秒）
const maxMessages = 100; // 画面に表示する最大メッセージ数（増やしました）
const WS_PORT = 8082; // WebSocketサーバーのポート番号（固定）

// メッセージ履歴管理用の変数
const displayedMessageIds = new Set(); // 表示済みメッセージIDを追跡
let isLoadingHistory = false; // 履歴読み込み中フラグ

// DOMロード時の初期化処理
document.addEventListener("DOMContentLoaded", () => {
	console.log("SUIperCHAT OBS Display initialized v1.0.8");
	initializeWebSocket();
});

/**
 * WebSocket接続を初期化する
 */
function initializeWebSocket() {
	// URLからWebSocketパラメータを取得
	// (現在は未使用だが、将来的にカスタムWebSocketアドレスを指定できるようにするため保持)
	// const urlParams = new URLSearchParams(window.location.search);

	// 注意: OBSサーバーはポート8081で動いていますが、
	// WebSocketサーバーは別のポート8082で動いています
	// そのため、ハードコードされたアドレスを使用します

	// どのポートを使用しているかを明確に表示
	console.log(`Using WebSocket port: ${WS_PORT}`);

	// 修正前: 現在のホストのWebSocketエンドポイントを使用
	// const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	// const wsHost = window.location.host;
	// const wsUrl = `${wsProtocol}//${wsHost}/ws`;

	// 修正後: 正しいWebSocketサーバーのアドレスを直接指定
	const wsUrl = `ws://127.0.0.1:${WS_PORT}/ws`;

	console.log(`Connecting to WebSocket server: ${wsUrl}`);

	// 接続ステータスを更新
	updateConnectionStatus("Connecting...", "connecting");

	// 既存のWebSocket接続をクリーンアップ
	if (socket) {
		socket.close();
	}

	// 新しい接続のためにメッセージ履歴をリセット
	displayedMessageIds.clear();
	isLoadingHistory = false;

	// 新しいWebSocket接続を作成
	socket = new WebSocket(wsUrl);

	// WebSocketイベントハンドラを設定
	setupWebSocketEventHandlers();
}

/**
 * WebSocketのイベントハンドラをセットアップする
 */
function setupWebSocketEventHandlers() {
	// 接続が開いたとき
	socket.addEventListener("open", () => {
		console.log("WebSocket connection established");
		// WebSocket接続状態を更新
		updateConnectionStatus("Connected", "connected");
		// 再接続タイマーがある場合はクリア
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}

		// 接続完了後、過去のメッセージ履歴を取得
		requestMessageHistory();
	});

	// メッセージを受信したとき
	socket.addEventListener("message", (event) => {
		console.log("WebSocket message received:", event.data);
		try {
			const data = JSON.parse(event.data);

			// メッセージ受信時には状態を変更せず、受信を視覚的に示す
			blinkConnectionIndicator();

			// メッセージの種類に応じた処理（MessageTypeに合わせる）
			if (data.type === "superchat") {
				// スーパーチャットメッセージを表示
				displaySuperchatMessage(data);
			} else if (data.type === "chat") {
				// 通常チャットメッセージを表示
				displayChatMessage(data);
			} else if (data.type === "HISTORY_DATA") {
				// 履歴データメッセージを処理
				handleHistoryData(data);
			} else {
				// その他のメッセージタイプの場合
				console.log("Unknown message type received:", data);
			}
		} catch (error) {
			console.error("Error parsing WebSocket message:", error);
		}
	});

	// エラーが発生したとき
	socket.addEventListener("error", (event) => {
		console.error("WebSocket error:", event);
		// WebSocket接続状態を更新
		updateConnectionStatus("エラー", "error");
	});

	// 接続が閉じたとき
	socket.addEventListener("close", (event) => {
		console.log(
			`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`,
		);
		// WebSocket接続状態を更新
		updateConnectionStatus("Disconnected", "error");

		// 自動再接続
		if (!reconnectTimeout) {
			reconnectTimeout = setTimeout(() => {
				console.log("Attempting to reconnect...");
				// WebSocket接続状態を更新
				updateConnectionStatus("Reconnecting...", "connecting");
				initializeWebSocket();
			}, reconnectInterval);
		}
	});
}

/**
 * 過去のメッセージ履歴を要求する
 */
function requestMessageHistory() {
	if (!socket || socket.readyState !== WebSocket.OPEN || isLoadingHistory) {
		console.warn("Cannot request history: WebSocket not ready or already loading");
		return;
	}

	console.log("Requesting message history...");
	isLoadingHistory = true;

	// 履歴取得リクエストを送信
	const historyRequest = {
		type: "GET_HISTORY",
		limit: 50, // 最新50件を取得
		before_timestamp: null // 最新から取得
	};

	try {
		socket.send(JSON.stringify(historyRequest));
		console.log("History request sent:", historyRequest);
	} catch (error) {
		console.error("Failed to send history request:", error);
		isLoadingHistory = false;
	}
}

/**
 * 履歴データメッセージを処理する
 *
 * @param {Object} data - 履歴データメッセージ
 */
function handleHistoryData(data) {
	console.log("Processing history data:", data);
	isLoadingHistory = false;

	if (!data.messages || !Array.isArray(data.messages)) {
		console.warn("Invalid history data format:", data);
		return;
	}

	const container = document.getElementById("superchat-container");
	if (!container) {
		console.error("Superchat container not found");
		return;
	}

	// 履歴メッセージを古い順にソート（タイムスタンプ昇順）
	const sortedMessages = data.messages.sort((a, b) => a.timestamp - b.timestamp);

	console.log(`Displaying ${sortedMessages.length} history messages`);

	// 各履歴メッセージを表示
	sortedMessages.forEach((message, index) => {
		// 重複チェック
		if (displayedMessageIds.has(message.id)) {
			console.log(`Skipping duplicate message: ${message.id}`);
			return;
		}

		// メッセージIDを記録
		displayedMessageIds.add(message.id);

		// メッセージタイプに応じて表示
		if (message.type === "superchat") {
			displaySuperchatMessage(message, true); // 履歴フラグを渡す
		} else if (message.type === "chat") {
			displayChatMessage(message, true); // 履歴フラグを渡す
		}

		// 履歴メッセージの場合はスクロールを抑制（最後のメッセージのみスクロール）
		if (index === sortedMessages.length - 1) {
			// 最後の履歴メッセージの後にスクロール
			setTimeout(() => {
				container.scrollTop = container.scrollHeight;
			}, 100);
		}
	});

	console.log(`History loading completed. Total displayed messages: ${displayedMessageIds.size}`);
}

/**
 * 接続状態を更新する
 *
 * @param {string} status - 接続状態のテキスト
 * @param {string} statusClass - 接続状態のクラス名（connected, connecting, error）
 */
function updateConnectionStatus(status, statusClass) {
	const statusElement = document.getElementById("connection-status");
	const dotElement = document.getElementById("status-dot");
	const indicatorElement = document.querySelector(".connection-indicator");

	if (statusElement) {
		statusElement.textContent = status;
	}

	if (dotElement) {
		// すべてのクラスをリセット
		dotElement.classList.remove("connected", "connecting", "error");
		// 新しいクラスを追加
		dotElement.classList.add(statusClass);
	}

	// 接続インジケーター全体にもクラスを適用
	if (indicatorElement) {
		// すべてのステータスクラスをリセット
		indicatorElement.classList.remove("connected", "connecting", "error");
		// 現在のステータスクラスを追加
		indicatorElement.classList.add(statusClass);
	}
}

/**
 * 通常チャットメッセージを表示する
 * YouTube風のDOM構造を模倣して表示します
 *
 * @param {Object} data - チャットデータ
 * @param {boolean} isHistory - 履歴メッセージかどうか（デフォルト: false）
 */
function displayChatMessage(data, isHistory = false) {
	const container = document.getElementById("superchat-container");

	// データチェック - 必須項目がない場合はエラーログを出力
	if (!data || !data.display_name) {
		console.error("Invalid chat data received:", data);
		// 元のデータは変更せず、表示用のデータを作成
		const fallbackData = {
			id: data?.id || `fallback-${Date.now()}`,
			display_name: "Unknown User",
			message: data?.message || "No message content",
			timestamp: Date.now(),
		};

		// 安全な表示用データを使用
		renderChatMessage(container, fallbackData, isHistory);
		return;
	}

	// リアルタイムメッセージの場合は重複チェック
	if (!isHistory) {
		if (data.id && displayedMessageIds.has(data.id)) {
			console.log(`Skipping duplicate real-time message: ${data.id}`);
			return;
		}
		// メッセージIDを記録
		if (data.id) {
			displayedMessageIds.add(data.id);
		}
	}

	// 正常なデータの場合は表示処理を行う
	renderChatMessage(container, data, isHistory);
}

/**
 * チャットメッセージのレンダリング処理
 *
 * @param {HTMLElement} container - メッセージを追加する親要素
 * @param {Object} chatData - レンダリングするチャットデータ
 * @param {boolean} isHistory - 履歴メッセージかどうか（デフォルト: false）
 */
function renderChatMessage(container, chatData, isHistory = false) {
	// 新しいチャットメッセージ要素を作成 - YouTube風の構造
	// 実際のYouTubeのHTML構造を参考に、yt-live-chat-text-message-renderer 要素を直接作成
	const chatElement = document.createElement(
		"yt-live-chat-text-message-renderer",
	);
	chatElement.className = "style-scope yt-live-chat-item-list-renderer"; // Add necessary classes
	chatElement.setAttribute("use-opacity-for-context-menu-visibility", "");
	chatElement.setAttribute("modern", "");
	// chatElement.id = `message-${chatData.timestamp}`; // Optional: Add a unique ID

	// メンバー機能は不要なので、すべて通常リスナー扱いにする
	// author-type属性は設定しない (実際のHTMLにはauthor-type属性が存在)
	// if (chatData.author_type) {
	//     chatElement.setAttribute('author-type', chatData.author_type);
	// }

	// チャットメッセージの内容を設定 - 実際のYouTubeのHTML構造を模倣
	chatElement.innerHTML = `
        <yt-img-shadow id="author-photo" class="no-transition style-scope yt-live-chat-text-message-renderer" height="24" width="24" style="background-color: transparent;" loaded="">
            <!-- ユーザーアイコンはデータに含まれていないため、srcは空またはプレースホルダー -->
            <img id="img" draggable="false" class="style-scope yt-img-shadow" alt="" height="24" width="24" src="">
        </yt-img-shadow>
        <div id="content" class="style-scope yt-live-chat-text-message-renderer">
            <span id="timestamp" class="style-scope yt-live-chat-text-message-renderer">${formatTimestamp(chatData.timestamp)}</span>
            <yt-live-chat-author-chip class="style-scope yt-live-chat-text-message-renderer">
                <span id="prepend-chat-badges" class="style-scope yt-live-chat-author-chip"></span>
                <span id="author-name" dir="auto" class=" style-scope yt-live-chat-author-chip style-scope yt-live-chat-author-chip">${escapeHtml(chatData.display_name)}<span id="chip-badges" class="style-scope yt-live-chat-author-chip"></span></span>
                <span id="chat-badges" class="style-scope yt-live-chat-author-chip"></span>
            </yt-live-chat-author-chip>
            <span id="message" dir="auto" class="style-scope yt-live-chat-text-message-renderer">${escapeHtml(chatData.message || "")}</span>
        </div>
        <!-- メニューやアクションボタンはOBS表示では不要なため省略 -->
        <!-- <div id="menu" class="style-scope yt-live-chat-text-message-renderer">...</div> -->
        <!-- <div id="inline-action-button-container" class="style-scope yt-live-chat-text-message-renderer">...</div> -->
    `;

	// ユーザー名とメッセージの検証を行い、コンソールに表示（デバッグ用）
	console.log(
		`Chat message added - User: ${chatData.display_name}, Message: ${chatData.message || "[empty]"}`,
	);

	// 要素を追加
	container.appendChild(chatElement);

	// 最大表示数を超えた場合、古いメッセージを削除
	cleanupOldMessages();

	// 履歴メッセージの場合はスクロールを抑制
	if (!isHistory) {
		// 確実に最下部にスクロール
		setTimeout(() => {
			container.scrollTop = container.scrollHeight;
		}, 50);
	}
}

/**
 * スーパーチャットメッセージを表示する
 * YouTube風のDOM構造を模倣して表示します
 *
 * @param {Object} data - スーパーチャットデータ
 * @param {boolean} isHistory - 履歴メッセージかどうか（デフォルト: false）
 */
function displaySuperchatMessage(data, isHistory = false) {
	const container = document.getElementById("superchat-container");

	// データチェック - 必須項目がない場合はエラーログを出力
	if (!data || !data.display_name) {
		console.error("Invalid superchat data received:", data);
		return;
	}

	// リアルタイムメッセージの場合は重複チェック
	if (!isHistory) {
		if (data.id && displayedMessageIds.has(data.id)) {
			console.log(`Skipping duplicate real-time superchat: ${data.id}`);
			return;
		}
		// メッセージIDを記録
		if (data.id) {
			displayedMessageIds.add(data.id);
		}
	}

	// デバッグ用のログ出力
	console.log("Displaying superchat message:", data);
	console.log(
		"Superchat data structure:",
		JSON.stringify(data.superchat || {}),
	);

	// 新しいスーパーチャット要素を作成 - YouTube風の構造
	const superchatElement = document.createElement(
		"yt-live-chat-paid-message-renderer",
	);

	// メッセージの有無に応じてヘッダーのみ表示かを決定
	if (!data.message || data.message.trim() === "") {
		superchatElement.setAttribute("show-only-header", "");
	}

	// スーパーチャット金額を取得
	// WebSocketメッセージの型定義に合わせて適切に処理
	let amount = 0;
	let coin = "SUI";

	// SuperchatMessageインターフェースに従って処理
	if (data.superchat) {
		// 金額を取得（デフォルト0）
		amount = data.superchat.amount || 0;
		// コイン種別を取得（デフォルトSUI）
		coin = data.superchat.coin || "SUI";

		console.log(`Superchat details: Amount=${amount}, Coin=${coin}`);
	} else {
		console.warn("Superchat data missing or invalid format");
	}

	// 金額と通貨を表示（ユーザーが選択したコイン種別を表示）
	const formattedAmount = `${amount} ${coin}`;

	// スーパーチャットの内容を設定 - YouTube風の構造に完全準拠
	superchatElement.innerHTML = `
        <div id="card" class="yt-live-chat-paid-message-renderer">
            <div id="header" class="yt-live-chat-paid-message-renderer">
                <div id="author-photo" class="yt-live-chat-paid-message-renderer">
                    <!-- 非表示だがCSS構造のため残す -->
                </div>
                <div id="header-content">
                    <div id="header-content-primary-column" class="yt-live-chat-paid-message-renderer">
                        <div id="single-line" class="yt-live-chat-paid-message-renderer">
                            <yt-live-chat-author-chip disable-highlighting class="yt-live-chat-paid-message-renderer">
                                <span id="author-name" class="yt-live-chat-author-chip">
                                    ${escapeHtml(data.display_name)}
                                </span>
                                <span id="chat-badges"></span>
                            </yt-live-chat-author-chip>
                        </div>
                    </div>
                </div>
                <div id="purchase-amount-column" class="yt-live-chat-paid-message-renderer">
                    <span id="purchase-amount">${formattedAmount}</span>
                </div>
                <div id="menu" class="yt-live-chat-paid-message-renderer"></div>
            </div>
            ${
							data.message && data.message.trim() !== ""
								? `<div id="content" class="yt-live-chat-paid-message-renderer">
                    <div id="message" dir="auto" class="yt-live-chat-paid-message-renderer">
                        ${escapeHtml(data.message)}
                    </div>
                </div>`
								: ""
						}
            <div id="lower-bumper" class="yt-live-chat-paid-message-renderer"></div>
            <div id="action-buttons" class="yt-live-chat-paid-message-renderer"></div>
            <div id="creator-heart-button" class="yt-live-chat-paid-message-renderer"></div>
            <div id="gradient-container" class="yt-live-chat-paid-message-renderer"></div>
        </div>
    `;

	// 要素を追加
	container.appendChild(superchatElement);

	// 最大表示数を超えた場合、古いメッセージを削除
	cleanupOldMessages();

	// 履歴メッセージの場合はスクロールを抑制
	if (!isHistory) {
		// 確実に最下部にスクロール
		setTimeout(() => {
			container.scrollTop = container.scrollHeight;
		}, 50);
	}
}

/**
 * 金額に基づいたCSSクラス名を取得する
 *
 * @param {number} amount - スーパーチャット金額
 * @returns {string} - CSSクラス名
 */
function getAmountClass(amount) {
	if (amount >= 10) return "10";
	if (amount >= 5) return "5";
	if (amount >= 3) return "3";
	return "1";
}

/**
 * 古いメッセージをクリーンアップする
 */
function cleanupOldMessages() {
	const container = document.getElementById("superchat-container");
	const messages = container.querySelectorAll(
		".chat-message, .superchat-message",
	);

	// 表示数が最大値を超えた場合、古いメッセージを削除
	while (messages.length > maxMessages) {
		container.removeChild(messages[0]);
	}
}

/**
 * タイムスタンプをフォーマットする
 *
 * @param {number} timestamp - UNIXタイムスタンプ（ミリ秒）
 * @returns {string} - フォーマットされた時刻文字列
 */
function formatTimestamp(timestamp) {
	if (!timestamp) return "";

	const date = new Date(timestamp);
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * HTMLエスケープ関数
 *
 * @param {string} unsafe - エスケープする文字列
 * @returns {string} - エスケープされた文字列
 */
function escapeHtml(unsafe) {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/**
 * 接続インジケータを一時的に点滅させる
 * メッセージ受信時の視覚的フィードバック
 */
function blinkConnectionIndicator() {
	const dotElement = document.getElementById("status-dot");
	if (!dotElement) return;

	// 一時的に明るくする
	dotElement.style.opacity = "1";
	dotElement.style.transform = "scale(1.2)";

	// 少し経ったら元に戻す
	setTimeout(() => {
		dotElement.style.opacity = "";
		dotElement.style.transform = "";
	}, 300);
}
