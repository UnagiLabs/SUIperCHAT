# SuiperCHAT Streamer App

SuiperCHAT Streamer App は、SuiperCHAT サービスを利用するストリーマー向けのデスクトップアプリケーションです。OBSなどの配信ソフトウェアと連携し、視聴者からのSuperCHAT通知をオーバーレイ表示する機能などを提供します。

## 機能

- OBS連携: SuperCHAT通知をOBSなどのブラウザソースとして表示
- ウォレット設定: SuperCHATを受け取るSuiウォレットアドレスを設定
- 過去のSuperCHAT履歴表示
- その他設定項目

## セットアップ

### 前提条件

- Node.js (v18以上推奨)
- Rust (Tauriビルドに必要)
- Tauri CLI (`cargo install tauri-cli`)

### インストール

1. リポジトリをクローンします。
   ```bash
   git clone <リポジトリURL> # 実際のリポジトリURLに置き換えてください
   cd suiperchat_streamer_app
   ```
2. 依存関係をインストールします。
   ```bash
   npm install
   # または
   # yarn install
   # または
   # pnpm install
   # または
   # bun install
   ```

## 開発環境での実行

### Tauriアプリケーションの起動

```bash
npm run tauri dev
```
このコマンドはTauriアプリケーションを開発モードで起動します。Next.js開発サーバーも同時に起動されます。

## ビルド

プロダクション用のアプリケーションをビルドするには、以下のコマンドを実行します。

```bash
npm run build
npm run tauri build
```
ビルドされたアプリケーションは `src-tauri/target/release` ディレクトリに出力されます。

## 使い方

1. アプリケーションを起動します。
2. アプリケーションの画面に表示される指示に従い、ウォレットアドレスなどの初期設定を行います。
3. OBSなどの配信ソフトウェアに、アプリケーション内で生成されるブラウザソースURLを追加します。
4. 必要に応じて、アプリケーション内の設定を変更します。
