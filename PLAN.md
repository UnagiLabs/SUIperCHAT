# ウォレット未入力時のサーバー起動防止修正計画

## 1. 背景

`suiperchat_streamer_app` において、ユーザーがウォレットアドレスを入力する前に「サーバー開始」ボタンを押すと、意図せずサーバーが起動してしまう。
これを防ぎ、ウォレットアドレスが設定されている場合のみサーバーを起動できるようにする。

## 2. 目的

ウォレットアドレスが未入力の状態では、サーバー開始ボタンを押してもサーバーが起動しないようにアプリケーションを修正する。

## 3. 修正対象ファイル

-   [`suiperchat_streamer_app/src/components/features/dashboard/ServerControl.tsx`](suiperchat_streamer_app/src/components/features/dashboard/ServerControl.tsx:1)

## 4. 修正方針

[`ServerControl.tsx`](suiperchat_streamer_app/src/components/features/dashboard/ServerControl.tsx:1) 内のサーバー開始処理を行う関数 [`handle_start_server`](suiperchat_streamer_app/src/components/features/dashboard/ServerControl.tsx:63) に、ウォレットアドレスの存在チェック処理を追加する。

### 4.1. 具体的な手順

1.  **ウォレットアドレスの取得:**
    *   [`handle_start_server`](suiperchat_streamer_app/src/components/features/dashboard/ServerControl.tsx:63) 関数の冒頭で、ブラウザのローカルストレージからウォレットアドレスを取得する。
    *   ローカルストレージのキーは、[`WalletAddressConfig.tsx`](suiperchat_streamer_app/src/components/features/dashboard/WalletAddressConfig.tsx:1) で定義されている `WALLET_ADDRESS_KEY` (`suiperchat_wallet_address`) を使用する。
2.  **ウォレットアドレスの検証:**
    *   取得したウォレットアドレスが `null`、`undefined`、または空文字列でないことを確認する。
3.  **処理の分岐:**
    *   **ウォレットアドレスが存在しない場合:**
        *   `sonner` (トースト通知ライブラリ) を使用して、ユーザーに「ウォレットアドレスを設定してください」といった趣旨のエラーメッセージを表示する。
        *   サーバー起動コマンド (`invoke("start_websocket_server")`) を呼び出さずに処理を終了する。
    *   **ウォレットアドレスが存在する場合:**
        *   既存のサーバー起動処理を続行する。

## 5. 処理フロー図 (Mermaid)

```mermaid
graph TD
    A[サーバー開始ボタンクリック] --> B{handle_start_server 関数実行};
    B --> C[ローカルストレージからウォレットアドレス取得];
    C --> D{ウォレットアドレス存在チェック};
    D -- アドレスなし --> E[エラーメッセージ表示 (Toast)];
    D -- アドレスあり --> F[サーバー起動処理実行 (invoke)];
    E --> G[処理終了];
    F --> G;
```

## 6. その他考慮事項

-   ローカルストレージのキー名は、[`WalletAddressConfig.tsx`](suiperchat_streamer_app/src/components/features/dashboard/WalletAddressConfig.tsx:1) で定義されている定数を参照することが望ましいが、今回は直接文字列として `ServerControl.tsx` 内で使用する（必要であればリファクタリング時に共通化を検討）。
-   エラーメッセージの内容は、ユーザーに分かりやすいものにする。