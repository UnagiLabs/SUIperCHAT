# WebSocketProvider リファクタリング計画

`viewer/src/components/providers/WebSocketProvider.tsx` が肥大化してきたため、機能ごとに分割し、見通しを良くするためのリファクタリング計画。

## 現状の `WebSocketProvider` の主な責務

1.  **WebSocket接続管理:** 接続確立、切断、エラーハンドリング、自動再接続ロジック。
2.  **メッセージ処理:** 受信メッセージの解析、メッセージリストの状態管理、メッセージ送信。
3.  **状態管理:** 接続ステータス、エラー情報、リトライ回数、メッセージリストなどの状態を一元管理。
4.  **コンテキスト提供:** 上記の状態と操作関数を React コンテキスト経由でアプリケーション全体に提供。

## 提案する設計方針

現在の `WebSocketProvider` が持つ責務を、関心事に基づいてカスタムフックに切り出す。Provider 自体は状態の保持と WebSocket インスタンスの管理、そして基本的なイベントハンドラの紐付けに集中させ、具体的な処理ロジックはフックに移譲する。

1.  **`WebSocketProvider` (スリム化):**
    *   `useState` で管理している `state` (status, url, error, retryCount, messages) を保持。
    *   `useRef` で管理している `ws_ref`, `reconnect_timeout_ref`, `connected_at_ref` を保持。
    *   WebSocket インスタンスを生成し、基本的なイベントハンドラ (`onopen`, `onmessage`, `onerror`, `onclose`) を設定。これらのハンドラ内で実行される詳細なロジックは、後述するカスタムフックの関数を呼び出す形にする。
    *   コアなアクション (`connect`, `disconnect`, `send_message`) の基本的な枠組みを提供（実際の処理はフックが行う）。
    *   `WebSocketContext` を提供する役割は維持。

2.  **`useWebSocketConnectionManager` フック (新規作成 or `useWebSocketConnect` の責務拡大):**
    *   `connect` 関数の詳細なロジック（URL検証、インスタンス作成など）を担当。
    *   `disconnect` 関数の詳細なロジックを担当。
    *   `attempt_reconnect` (自動再接続) のロジック全体を担当。
    *   `onopen`, `onerror`, `onclose` イベント発生時に `WebSocketProvider` の状態 (`state`) を更新するロジック (`update_status` に相当する処理) を担当。
    *   `WebSocketProvider` から状態更新関数や WebSocket インスタンスへの参照を受け取って動作。

3.  **`useWebSocketMessageHandler` フック (新規作成 or `useWebSocketMessage` の責務拡大):**
    *   `onmessage` イベントで受信したデータを解析し、メッセージの種類に応じて `WebSocketProvider` の `messages` 状態を更新するロジックを担当。
    *   `send_chat_message` と `send_superchat_message` の具体的な実装（`send_message` を呼び出す部分）を担当。
    *   `WebSocketProvider` から状態更新関数や `send_message` 関数を受け取って動作。

## コンポーネント/フック間の連携イメージ (Mermaid)

```mermaid
graph TD
    subgraph Application Components
        ChatUI[Chat UI] -- uses --> useWebSocketMessageHandler
        StatusDisplay[Status Display] -- uses --> useWebSocketConnectionManager
        SuperchatForm[Superchat Form] -- uses --> useWebSocketMessageHandler
    end

    subgraph Custom Hooks (Logic Layer)
        useWebSocketConnectionManager[useWebSocketConnectionManager] -- manages --> ConnectionLogic[Connection/Disconnection/Reconnection Logic]
        useWebSocketMessageHandler[useWebSocketMessageHandler] -- manages --> MessageLogic[Message Parsing & Sending Logic]

        useWebSocketConnectionManager -- interacts with --> WebSocketProviderAPI
        useWebSocketMessageHandler -- interacts with --> WebSocketProviderAPI
    end

    subgraph Provider & Context (Core Layer)
        WebSocketProvider[WebSocketProvider (Slim)] -- provides --> WebSocketContext[WebSocketContext (State & Core Actions)]
        WebSocketProvider -- holds --> StateManagement[State (status, messages, etc.)]
        WebSocketProvider -- manages --> WebSocketInstance[WebSocket Instance & Refs]
        WebSocketProviderAPI[Provider API (setState, ws_ref, etc.)]

        WebSocketProvider -- exposes --> WebSocketProviderAPI
    end

    ChatUI -- reads/updates --> WebSocketContext
    StatusDisplay -- reads --> WebSocketContext
    SuperchatForm -- reads/updates --> WebSocketContext

    style WebSocketProvider fill:#f9f,stroke:#333,stroke-width:2px
    style useWebSocketConnectionManager fill:#ccf,stroke:#333,stroke-width:1px
    style useWebSocketMessageHandler fill:#ccf,stroke:#333,stroke-width:1px
```

## この設計の利点

*   `WebSocketProvider` がシンプルになり、状態とインスタンス管理に集中できる。
*   接続関連のロジックとメッセージ関連のロジックが、それぞれのカスタムフックに明確に分離される。
*   既存の `useWebSocketConnect` や `useWebSocketMessage` を拡張する形で実装を進めることも可能。
*   各機能のテストがしやすくなる。

## 懸念点

*   フックと Provider 間での状態や関数の受け渡しが少し複雑になる可能性がある。