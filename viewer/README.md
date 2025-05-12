# SuiperCHAT Viewer

SuiperCHAT Viewer は、SUIperCHATを通じて配信者にスーパーチャットを送信するためのウェブアプリケーションです。

## 機能

- SUIウォレット (例: Sui Wallet, Suiet, Ethos WalletなどdApp-Kitが対応するもの) との接続
- 表示名とメッセージの入力
- 送金SUI額の選択 (またはコメントのみ送信)
- 配信者アプリへのWebSocket接続とメッセージ送信
- (必要に応じてファイル構造から読み取れる詳細機能を追加)

## 技術スタック

- フレームワーク: Next.js (React)
- 言語: TypeScript
- UI: shadcn UI, Tailwind CSS
- ブロックチェーン連携: SUI TypeScript SDK (`@mysten/dapp-kit`)
- 通信: WebSocket

## 前提条件

- 対応ブラウザ: Chrome, Firefox, Safariなど最新版
- SUIウォレット拡張機能 (上記ウォレット例)

## 使い方

1.  アクセス: 配信者から共有された「視聴者用URL」にブラウザでアクセスします。
2.  ウォレット接続: 画面の指示に従い、SUIウォレットを接続します。
3.  スーパーチャット送信:
    *   表示名とメッセージを入力します。
    *   送金したいSUIの金額を選択します (またはコメントのみ)。
    *   「送信」ボタンをクリックし、ウォレットでトランザクションを承認します。
    *   送信完了後、配信画面にメッセージが表示されることを確認します。

## (開発者向け) ローカル開発環境セットアップ

1.  リポジトリをクローンします。
    ```bash
    git clone https://github.com/UnagiLabs/SUIperCHAT
    cd viewer
    ```
2.  依存関係をインストールします。
    ```bash
    npm install
    # または
    # yarn install
    # または
    # pnpm install
    # または
    # bun install
    ```
3.  開発サーバーを起動します。
    ```bash
    npm run dev
    ```
4.  ブラウザで `http://localhost:3000` を開きます。

## トラブルシューティング / FAQ

(必要に応じて追記)

---

# SuiperCHAT Viewer (English)

The SuiperCHAT Viewer is a web application for sending SuperCHATs to streamers through the SuiperCHAT service.

## Features

- Connect with a SUI wallet (e.g., Sui Wallet, Suiet, Ethos Wallet, etc., supported by dApp-Kit).
- Enter display name and message.
- Select the amount of SUI to send (or send a comment only).
- Establish WebSocket connection to the streamer app and send messages.
- (Add more detailed features based on file structure if necessary)

## Tech Stack

- Framework: Next.js (React)
- Language: TypeScript
- UI: shadcn UI, Tailwind CSS
- Blockchain Integration: SUI TypeScript SDK (`@mysten/dapp-kit`)
- Communication: WebSocket

## Prerequisites

- Supported Browsers: Latest versions of Chrome, Firefox, Safari, etc.
- SUI Wallet Extension (Examples listed above)

## Usage

1.  Access: Access the "Viewer URL" shared by the streamer in your browser.
2.  Connect Wallet: Connect your SUI wallet following the on-screen instructions.
3.  Send SuperCHAT:
    *   Enter your display name and message.
    *   Select the amount of SUI you want to send (or send a comment only).
    *   Click the "Send" button and approve the transaction in your wallet.
    *   After sending, confirm that your message appears on the stream screen.

## (For Developers) Local Development Environment Setup

1.  Clone the repository.
    ```bash
    git clone https://github.com/UnagiLabs/SUIperCHAT
    cd viewer
    ```
2.  Install dependencies.
    ```bash
    npm install
    # or
    # yarn install
    # or
    # pnpm install
    # or
    # bun install
    ```
3.  Start the development server.
    ```bash
    npm run dev
    ```
4.  Open `http://localhost:3000` in your browser.

## Troubleshooting / FAQ

(Add if necessary)
