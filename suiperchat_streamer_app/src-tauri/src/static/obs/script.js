/**
 * SUIperCHAT OBS表示用JavaScriptファイル
 * 
 * WebSocketでスーパーチャットメッセージを受信し、OBS画面に表示する機能を実装します。
 * URLパラメータからWebSocketのアドレスを取得し、自動的に接続します。
 */

// グローバル変数
let socket = null;
let reconnectTimeout = null;
const reconnectInterval = 5000; // 再接続間隔（ミリ秒）
const maxMessages = 5; // 画面に表示する最大メッセージ数
const messageDisplayTime = 30000; // メッセージ表示時間（ミリ秒）

// DOMロード時の初期化処理
document.addEventListener('DOMContentLoaded', () => {
    console.log('SUIperCHAT OBS Display initialized');
    initializeWebSocket();
});

/**
 * WebSocket接続を初期化する
 */
function initializeWebSocket() {
    // URLからWebSocketパラメータを取得
    // (現在は未使用だが、将来的にカスタムWebSocketアドレスを指定できるようにするため保持)
    // const urlParams = new URLSearchParams(window.location.search);
    
    // サーバーがNGINXやApacheなどのプロキシを使用している場合、
    // ここで同一オリジンのWebSocketサーバーに接続するか、
    // URLパラメータから取得したカスタムアドレスに接続します
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    
    // バックグラウンドの場合は直接WebSocketエンドポイントを使用
    const wsUrl = `${wsProtocol}//${wsHost}/ws`;
    
    console.log(`Connecting to WebSocket server: ${wsUrl}`);
    
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
            
            // メッセージの種類に応じた処理
            if (data.message_type === 'superchat') {
                // スーパーチャットメッセージを表示
                displaySuperchatMessage(data);
            } else if (data.message_type === 'chat') {
                // 通常チャットメッセージの場合は何もしない（OBSには表示しない）
                console.log('Regular chat message received (not displayed)');
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    });

    // エラーが発生したとき
    socket.addEventListener('error', (event) => {
        console.error('WebSocket error:', event);
    });

    // 接続が閉じたとき
    socket.addEventListener('close', (event) => {
        console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        
        // 自動再接続
        if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
                console.log('Attempting to reconnect...');
                initializeWebSocket();
            }, reconnectInterval);
        }
    });
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
    
    // 金額に基づいたクラスを追加
    
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
    
    // 一定時間後にメッセージを削除
    setTimeout(() => {
        if (superchatElement.parentNode) {
            // フェードアウトアニメーションを追加
            superchatElement.classList.add('removing');
            
            // アニメーション完了後に要素を削除
            setTimeout(() => {
                if (superchatElement.parentNode) {
                    superchatElement.parentNode.removeChild(superchatElement);
                }
            }, 1000); // フェードアウトアニメーションの時間
        }
    }, messageDisplayTime);
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
    const messages = container.getElementsByClassName('superchat-message');
    
    // 表示数が最大値を超えた場合、古いメッセージを削除
    while (messages.length > maxMessages) {
        container.removeChild(messages[0]);
    }
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