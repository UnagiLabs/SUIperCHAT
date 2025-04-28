# Viewer: チップなしコメント送信フロー修正計画 (Plan Ver. 3)

## 目的

`viewer` アプリケーションにおいて、チップなし (amount=0) でコメントを送信する場合の処理フローを最適化する。現状のSUIコントラクト呼び出しを含むフローから、コントラクト呼び出しをスキップし、WebSocket経由でチャットメッセージとして直接サーバーに送信するフローに変更する。

## 背景

*   現状の `viewer/src/components/superchat/superchat-form.tsx` では、チップの有無に関わらずSUIコントラクト (`payment::process_superchat_payment`) を呼び出すための準備（残高確認、PTB構築）と試行が行われている。
*   チップなしの場合はSUIコントラクトを呼び出す必要がなく、ガス代の浪費や不要な処理が発生している。
*   クライアント側には、通常のチャットメッセージを送信するための `sendChatMessage` 関数が既に実装されている (`viewer/src/hooks/useWebSocketMessage.ts`)。
*   サーバー側 (`suiperchat_streamer_app/src-tauri/src/ws_server/session.rs`) は、`MessageType::CHAT` と `MessageType::SUPERCHAT` を区別して処理し、DBにも適切に保存するロジックを持っている。

## 修正計画

1.  **修正対象ファイル:** `viewer/src/components/superchat/superchat-form.tsx`
2.  **修正内容:** `on_submit` 関数内のロジックを以下のように変更する。
    *   フォームから送信された `values.amount` の値を確認する。
    *   **`values.amount > 0` (チップあり) の場合:**
        *   変更なし。これまで通り、SUIの残高確認、PTB構築、`signAndExecuteTransaction` によるコントラクト呼び出しを実行する。
        *   トランザクション成功後、`actions.sendSuperchatMessage` を呼び出し、`superchat` データ（amount, tx_hash, wallet_address）を含むメッセージをWebSocketで送信する。
    *   **`values.amount === 0` (チップなし) の場合:**
        *   SUI関連の処理（残高確認、PTB構築、コントラクト呼び出し）**全体をスキップ**する。
        *   代わりに、`actions.sendChatMessage` を呼び出し、`display_name` と `message` のみを含むメッセージ (type: `MessageType.CHAT`) をWebSocketで送信する。

## 修正によるフローの変化 (Mermaid図)

```mermaid
graph TD
    subgraph "修正後フロー (Plan Ver.3)"
        A[フォーム入力] --> B{amount === 0 ?};
        B -- Yes --> C[WebSocket: sendChatMessage (チャットとして送信)];
        B -- No --> D[SUI残高確認];
        D -- OK --> E[PTB構築];
        E --> F[コントラクト呼び出し];
        F -- 成功 --> G[WebSocket: sendSuperchatMessage (スパチャとして送信)];
        G --> H[完了];
        D -- NG --> I[エラー];
        F -- 失敗 --> I;
        C --> H;
    end

    style D fill:#f9f,stroke:#333,stroke-width:2px;
    style E fill:#f9f,stroke:#333,stroke-width:2px;
    style F fill:#f9f,stroke:#333,stroke-width:2px;
    style G fill:#f9f,stroke:#333,stroke-width:2px;
    style C fill:#ccf,stroke:#333,stroke-width:2px;
```

## 利点

*   クライアント側の修正のみで完結する。
*   `MessageType.CHAT` と `MessageType.SUPERCHAT` を意図通りに使い分けられ、コードの可読性と保守性が向上する。
*   チップなしコメント送信時に不要なSUIコントラクト呼び出しや関連処理を完全に省略できる。