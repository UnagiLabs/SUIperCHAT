/**
 * SUIperCHAT OBS表示用JavaScriptファイル (v1.0.5)
 * 
 * WebSocketでスーパーチャットメッセージを受信し、OBS画面に表示する機能を実装します。
 * URLパラメータからWebSocketのアドレスを取得し、自動的に接続します。
 * YouTubeライクな表示スタイルに対応するためのDOM構造を生成します。
 */

// グローバル変数
let socket = null;
let reconnectTimeout = null;
const reconnectInterval = 5000; // 再接続間隔（ミリ秒）
const maxMessages = 100; // 画面に表示する最大メッセージ数（増やしました）
const WS_PORT = 8082; // WebSocketサーバーのポート番号（固定）

// DOMロード時の初期化処理
document.addEventListener('DOMContentLoaded', () => {
    console.log('SUIperCHAT OBS Display initialized v1.0.3');
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
    updateConnectionStatus('Connecting...', 'connecting');
    
    // 既存のWebSocket接続をクリーンアップ
    if (socket) {
        socket.close();
    }
    
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
    socket.addEventListener('open', () => {
        console.log('WebSocket connection established');
        // WebSocket接続状態を更新
        updateConnectionStatus('Connected', 'connected');
        // 再接続タイマーがある場合はクリア
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
    });

    // メッセージを受信したとき
    socket.addEventListener('message', (event) => {
        console.log('WebSocket message received:', event.data);
        try {
            const data = JSON.parse(event.data);
            
            // メッセージ受信時には状態を変更せず、受信を視覚的に示す
            blinkConnectionIndicator();
            
            // メッセージの種類に応じた処理
            if (data.type === 'superchat') {
                // スーパーチャットメッセージを表示
                displaySuperchatMessage(data);
            } else if (data.type === 'chat') {
                // 通常チャットメッセージを表示
                displayChatMessage(data);
            } else {
                // その他のメッセージタイプの場合
                console.log('Unknown message type received:', data);
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    });

    // エラーが発生したとき
    socket.addEventListener('error', (event) => {
        console.error('WebSocket error:', event);
        // WebSocket接続状態を更新
        updateConnectionStatus('エラー', 'error');
    });

    // 接続が閉じたとき
    socket.addEventListener('close', (event) => {
        console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        // WebSocket接続状態を更新
        updateConnectionStatus('Disconnected', 'error');
        
        // 自動再接続
        if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
                console.log('Attempting to reconnect...');
                // WebSocket接続状態を更新
                updateConnectionStatus('Reconnecting...', 'connecting');
                initializeWebSocket();
            }, reconnectInterval);
        }
    });
}

/**
 * 接続状態を更新する
 * 
 * @param {string} status - 接続状態のテキスト
 * @param {string} statusClass - 接続状態のクラス名（connected, connecting, error）
 */
function updateConnectionStatus(status, statusClass) {
    const statusElement = document.getElementById('connection-status');
    const dotElement = document.getElementById('status-dot');
    
    if (statusElement) {
        statusElement.textContent = status;
    }
    
    if (dotElement) {
        // すべてのクラスをリセット
        dotElement.classList.remove('connected', 'connecting', 'error');
        // 新しいクラスを追加
        dotElement.classList.add(statusClass);
    }
}

/**
 * 通常チャットメッセージを表示する
 * YouTube風のDOM構造を模倣して表示します
 * 
 * @param {Object} data - チャットデータ
 */
function displayChatMessage(data) {
    const container = document.getElementById('superchat-container');
    
    // データチェック - 必須項目がない場合はエラーログを出力
    if (!data || !data.display_name) {
        console.error('Invalid chat data received:', data);
        // 元のデータは変更せず、表示用のデータを作成
        const fallbackData = {
            display_name: 'Unknown User', 
            message: data?.message || 'No message content',
            timestamp: Date.now()
        };
        
        // 安全な表示用データを使用
        renderChatMessage(container, fallbackData);
        return;
    }
    
    // 正常なデータの場合は表示処理を行う
    renderChatMessage(container, data);
}

/**
 * チャットメッセージのレンダリング処理
 * 
 * @param {HTMLElement} container - メッセージを追加する親要素
 * @param {Object} chatData - レンダリングするチャットデータ
 */
function renderChatMessage(container, chatData) {
    // 新しいチャットメッセージ要素を作成 - YouTube風の構造
    // 実際のYouTubeのHTML構造を参考に、yt-live-chat-text-message-renderer 要素を直接作成
    const chatElement = document.createElement('yt-live-chat-text-message-renderer');
    chatElement.className = 'style-scope yt-live-chat-item-list-renderer'; // Add necessary classes
    chatElement.setAttribute('use-opacity-for-context-menu-visibility', '');
    chatElement.setAttribute('modern', '');
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
            <span id="message" dir="auto" class="style-scope yt-live-chat-text-message-renderer">${escapeHtml(chatData.message || '')}</span>
        </div>
        <!-- メニューやアクションボタンはOBS表示では不要なため省略 -->
        <!-- <div id="menu" class="style-scope yt-live-chat-text-message-renderer">...</div> -->
        <!-- <div id="inline-action-button-container" class="style-scope yt-live-chat-text-message-renderer">...</div> -->
    `;
    
    // ユーザー名とメッセージの検証を行い、コンソールに表示（デバッグ用）
    console.log(`Chat message added - User: ${chatData.display_name}, Message: ${chatData.message || '[empty]'}`);
    
    // 要素を追加
    container.appendChild(chatElement);
    
    // 最大表示数を超えた場合、古いメッセージを削除
    cleanupOldMessages();
    
    // メッセージ要素を表示領域内に自動スクロール
    chatElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

/**
 * スーパーチャットメッセージを表示する
 * YouTube風のDOM構造を模倣して表示します
 * 
 * @param {Object} data - スーパーチャットデータ
 */
function displaySuperchatMessage(data) {
    const container = document.getElementById('superchat-container');
    
    // データチェック - 必須項目がない場合はエラーログを出力
    if (!data || !data.display_name) {
        console.error('Invalid superchat data received:', data);
        return;
    }
    
    // 新しいスーパーチャット要素を作成 - YouTube風の構造
    const superchatElement = document.createElement('div');
    superchatElement.className = 'yt-live-chat-paid-message-renderer';
    
    // メッセージの有無に応じてヘッダーのみ表示かを決定
    if (!data.message || data.message.trim() === '') {
        superchatElement.setAttribute('show-only-header', '');
    }
    
    // スーパーチャット金額を整形
    const amount = data.superchat?.amount || 0;
    const coin = data.superchat?.coin || 'SUI';
    const formattedAmount = `¥${amount.toLocaleString()}`;
    
    // スーパーチャットの内容を設定 - YouTube風の構造
    superchatElement.innerHTML = `
        <div id="card" class="yt-live-chat-paid-message-renderer">
            <div id="header" class="yt-live-chat-paid-message-renderer">
                <div id="header-content">
                    <div id="header-content-primary-column" class="yt-live-chat-paid-message-renderer">
                        <div id="single-line" class="yt-live-chat-paid-message-renderer">
                            <yt-live-chat-author-chip disable-highlighting class="yt-live-chat-paid-message-renderer">
                                <span id="author-name" class="yt-live-chat-author-chip">
                                    ${escapeHtml(data.display_name)}
                                </span>
                                <span id="chat-badges"></span>
                            </yt-live-chat-author-chip>
                            <div id="purchase-amount-column" class="yt-live-chat-paid-message-renderer">
                                <span id="purchase-amount">${formattedAmount}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            ${data.message && data.message.trim() !== '' ? 
                `<div id="content" class="yt-live-chat-paid-message-renderer">
                    <div id="message" dir="auto" class="yt-live-chat-paid-message-renderer">
                        ${escapeHtml(data.message)}
                    </div>
                </div>` : ''}
        </div>
    `;
    
    // 要素を追加
    container.appendChild(superchatElement);
    
    // 最大表示数を超えた場合、古いメッセージを削除
    cleanupOldMessages();
    
    // メッセージ要素を表示領域内に自動スクロール
    superchatElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

/**
 * 金額に基づいたCSSクラス名を取得する
 * 
 * @param {number} amount - スーパーチャット金額
 * @returns {string} - CSSクラス名
 */
function getAmountClass(amount) {
    if (amount >= 10) return '10';
    if (amount >= 5) return '5';
    if (amount >= 3) return '3';
    return '1';
}

/**
 * 古いメッセージをクリーンアップする
 */
function cleanupOldMessages() {
    const container = document.getElementById('superchat-container');
    const messages = container.querySelectorAll('.chat-message, .superchat-message');
    
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
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    const dotElement = document.getElementById('status-dot');
    if (!dotElement) return;
    
    // 一時的に明るくする
    dotElement.style.opacity = '1';
    dotElement.style.transform = 'scale(1.2)';
    
    // 少し経ったら元に戻す
    setTimeout(() => {
        dotElement.style.opacity = '';
        dotElement.style.transform = '';
    }, 300);
}
