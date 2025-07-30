// 簡単なWebSocketモックサーバー（開発用）
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

console.log('Mock WebSocket server started on ws://localhost:8080');

wss.on('connection', function connection(ws) {
  console.log('Client connected');

  ws.on('message', function incoming(message) {
    console.log('received:', message.toString());
    
    try {
      const data = JSON.parse(message);
      
      // エコーバック（全クライアントに送信）
      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            ...data,
            timestamp: Date.now(),
            echo: true
          }));
        }
      });
      
    } catch (e) {
      console.error('JSON parse error:', e);
    }
  });

  ws.on('close', function close() {
    console.log('Client disconnected');
  });

  // 接続時にウェルカムメッセージ
  ws.send(JSON.stringify({
    type: 'SYSTEM',
    message: 'Connected to mock server',
    timestamp: Date.now()
  }));
});