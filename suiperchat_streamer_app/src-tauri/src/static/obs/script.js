/**
 * SUIperCHAT OBS表示用JavaScriptファイル (v1.0.3)
 * 
 * WebSocketでスーパーチャットメッセージを受信し、OBS画面に表示する機能を実装します。
 * URLパラメータからWebSocketのアドレスを取得し、自動的に接続します。
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
            if (data.message_type === 'superchat') {
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
 * 
 * @param {Object} data - チャットデータ
 */
function displayChatMessage(data) {
    const container = document.getElementById('superchat-container');
    
    // 新しいチャットメッセージ要素を作成
    const chatElement = document.createElement('div');
    chatElement.className = 'chat-message';
    
    // チャットメッセージの内容を設定
    chatElement.innerHTML = `
        <div class="chat-header">
            <span class="display-name">${escapeHtml(data.display_name)}</span>
            <span class="timestamp">${formatTimestamp(data.timestamp)}</span>
        </div>
        <div class="message-content">${escapeHtml(data.message)}</div>
    `;
    
    // 要素を追加
    container.appendChild(chatElement);
    
    // 最大表示数を超えた場合、古いメッセージを削除
    cleanupOldMessages();
    
    // メッセージ要素を表示領域内に自動スクロール
    chatElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

/**
 * スーパーチャットメッセージを表示する
 * 
 * @param {Object} data - スーパーチャットデータ
 */
function displaySuperchatMessage(data) {
    const container = document.getElementById('superchat-container');
    
    // 新しいスーパーチャット要素を作成
    const superchatElement = document.createElement('div');
    superchatElement.className = `superchat-message amount-${getAmountClass(data.superchat.amount)}`;
    
    // スーパーチャットの内容を設定
    superchatElement.innerHTML = `
        <div class="superchat-header">
            <span class="display-name">${escapeHtml(data.display_name)}</span>
            <span class="amount">${data.superchat.amount} SUI</span>
        </div>
        <div class="message-content">${escapeHtml(data.content)}</div>
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