# SUIperCHAT

[English description follows below.](#suiperchat-english)
**⚠️ 開発中のプロジェクト ⚠️**
本プロジェクトは現在開発中であり、仕様や機能は変更される可能性があります。

## 概要

SUIperCHATは、SUIブロックチェーンを活用した配信者向けスーパーチャットシステムです。YouTube等の既存プラットフォームでの配信に連携しながら、SUIを使用した独自の投げ銭システムを提供します。

## 主な機能

### 視聴者向け
- SUIウォレット連携によるスーパーチャット送信
- 金額選択 (送金なし、または1SUI/3SUI/5SUI/10SUIから選択)
- メッセージと表示名の設定
- シンプルな操作フロー

### 配信者向け
- OBSブラウザソースとの連携
- スーパーチャット表示のカスタマイズ
- 配信セッションごとのメッセージ・スパチャ履歴管理
- ローカルWebSocketサーバーによるリアルタイム表示
- Rust + Tauriによる軽量・セキュアなデスクトップアプリケーション

## アーキテクチャ

```mermaid
graph TD
    A[視聴者 (Viewer)] -- HTTPS --> B(Viewer Frontend);
    B -- SUI Wallet --> C(SUI Blockchain);
    B -- WebSocket --> D{Streamer App};
    E[配信者 (Streamer)] -- 操作 --> D;
    D -- Localhost HTTP --> F(OBS Browser Source);
    D -- SQLite --> G[(Local Database)];
    D -- SUI Wallet --> C;

    subgraph Streamer App (Tauri)

        D --- D_Rust[Rust Backend];
        D --- D_Web[WebView Frontend];
        D_Rust -- WebSocket Server --> B;
        D_Rust -- HTTP Server --> F;
        D_Rust -- DB Access --> G;
        D_Rust -- SUI SDK --> C;
    end
```

## 技術スタック

### 視聴者向けフロントエンド (viewer/)
- 言語: TypeScript
- フレームワーク: Next.js (React)
- UI: shadcn UI, Tailwind CSS
- ブロックチェーン連携: SUI TypeScript SDK (@mysten/dapp-kit)

### 配信者向けデスクトップアプリケーション (suiperchat_streamer_app/)
- **フレームワーク**: Tauri (Rust + WebView)
    - Rustバックエンド:
        - Webサーバー (WebSocket/HTTP): Actix Web
        - 非同期ランタイム: Tokio
        - データベース: SQLite (via SQLx)
        - 状態管理: `tauri::AppHandle`, `tauri::State`
    - WebViewフロントエンド:
        - 言語: TypeScript
        - フレームワーク: Next.js (React)
        - UI: shadcn UI, Tailwind CSS
        - Tauri連携: `@tauri-apps/api`

### スマートコントラクト (contract/)
- 言語: Move (Sui)

### その他
- パッケージマネージャー: npm
- フォーマッター/リンター: Biome

## 使い方 / セットアップ

### 配信者向け
1.  **ダウンロード**: リリースページから最新版のデスクトップアプリをダウンロードします。（現在は開発中のため、手動ビルドが必要です）
2.  **起動**: アプリケーションを実行します。
3.  **初期設定**:
    *   アプリ内の設定画面で、ご自身のSUIウォレットアドレス（スパチャ受取用）を設定します。
    *   必要に応じて、OBS表示のテーマやスタイルをカスタマイズします。
4.  **サーバー開始**: アプリ画面の「サーバー開始」ボタンをクリックします。
5.  **OBS設定**:
    *   アプリに表示される「OBS用URL」をコピーします。
    *   OBSで「ブラウザ」ソースを追加し、コピーしたURLを貼り付けます。
    *   幅と高さを配信解像度に合わせて調整します。
6.  **視聴者へ共有**: アプリに表示される「視聴者用URL」をコピーし、配信概要欄などで視聴者に共有します。

### 視聴者向け
1.  **アクセス**: 配信者が共有した「視聴者用URL」にブラウザでアクセスします。
2.  **ウォレット接続**: 画面の指示に従い、SUIウォレットを接続します。
3.  **スーパーチャット送信**:
    *   表示名とメッセージを入力します。
    *   送金したいSUIの金額（1, 3, 5, 10 SUI）を選択します。（送金なしのコメントも可能です）
    *   「送信」ボタンをクリックし、ウォレットでトランザクションを承認します。
    *   送信が完了すると、配信画面にメッセージが表示されます。

## ロードマップ

- [ ] カスタム金額設定オプション
- [ ] 配信プラットフォームAPI連携（YouTube, Twitchなど）
- [ ] 詳細な分析・集計機能

## ライセンス

本プロジェクトは [MIT License](LICENSE) の下で公開されています。

---

# SUIperCHAT (English)

**⚠️ Project Under Development ⚠️**
This project is currently under development, and specifications or features may change.

## Overview

SUIperCHAT is a Super Chat system for streamers utilizing the SUI blockchain. It provides a unique tipping system using SUI while integrating with streams on existing platforms like YouTube.

## Key Features

### For Viewers
- Send Super Chats via SUI wallet integration.
- Select amount (no sending, or choose from 1 SUI / 3 SUI / 5 SUI / 10 SUI).
- Set message and display name.
- Simple operation flow.

### For Streamers
- Integration with OBS browser source.
- Customize Super Chat display.
- Manage message/Super Chat history per stream session.
- Real-time display via local WebSocket server.
- Lightweight and secure desktop application powered by Rust + Tauri.

## Architecture

```mermaid
graph TD
    A[Viewer] -- HTTPS --> B(Viewer Frontend);
    B -- SUI Wallet --> C(SUI Blockchain);
    B -- WebSocket --> D{Streamer App};
    E[Streamer] -- Operate --> D;
    D -- Localhost HTTP --> F(OBS Browser Source);
    D -- SQLite --> G[(Local Database)];
    D -- SUI Wallet --> C;

    subgraph Streamer App (Tauri)

        D --- D_Rust[Rust Backend];
        D --- D_Web[WebView Frontend];
        D_Rust -- WebSocket Server --> B;
        D_Rust -- HTTP Server --> F;
        D_Rust -- DB Access --> G;
        D_Rust -- SUI SDK --> C;
    end
```

## Tech Stack

### Viewer Frontend (viewer/)
- Language: TypeScript
- Framework: Next.js (React)
- UI: shadcn UI, Tailwind CSS
- Blockchain Integration: SUI TypeScript SDK (@mysten/dapp-kit)

### Streamer Desktop Application (suiperchat_streamer_app/)
- **Framework**: Tauri (Rust + WebView)
    - Rust Backend:
        - Web Server (WebSocket/HTTP): Actix Web
        - Async Runtime: Tokio
        - Database: SQLite (via SQLx)
        - State Management: `tauri::AppHandle`, `tauri::State`
    - WebView Frontend:
        - Language: TypeScript
        - Framework: Next.js (React)
        - UI: shadcn UI, Tailwind CSS
        - Tauri Integration: `@tauri-apps/api`

### Smart Contract (contract/)
- Language: Move (Sui)

### Others
- Package Manager: npm
- Formatter/Linter: Biome

## Usage / Getting Started

### For Streamers
1.  **Download**: Download the latest desktop app from the release page. (Manual build required during development).
2.  **Launch**: Run the application.
3.  **Initial Setup**:
    *   Set your SUI wallet address (for receiving Super Chats) in the app's settings screen.
    *   Customize the OBS display theme and style as needed.
4.  **Start Server**: Click the "Start Server" button in the app screen.
5.  **OBS Setup**:
    *   Copy the "OBS URL" displayed in the app.
    *   Add a "Browser" source in OBS and paste the copied URL.
    *   Adjust the width and height to match your stream resolution.
6.  **Share with Viewers**: Copy the "Viewer URL" displayed in the app and share it with viewers (e.g., in the stream description).

### For Viewers
1.  **Access**: Access the "Viewer URL" shared by the streamer in your browser.
2.  **Connect Wallet**: Connect your SUI wallet following the on-screen instructions.
3.  **Send Super Chat**:
    *   Enter your display name and message.
    *   Select the SUI amount you want to send (1, 3, 5, 10 SUI). (Comments without sending are also possible).
    *   Click the "Send" button and approve the transaction in your wallet.
    *   Once sent, your message will appear on the stream screen.

## Roadmap

- [ ] Custom amount setting option
- [ ] Streaming platform API integration (YouTube, Twitch, etc.)
- [ ] Detailed analytics and aggregation features

## License

This project is licensed under the [MIT License](LICENSE).