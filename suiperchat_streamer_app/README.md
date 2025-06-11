# SuiperCHAT Streamer App

SuiperCHAT Streamer App は、SuiperCHAT サービスを利用するストリーマー向けのデスクトップアプリケーションです。OBSなどの配信ソフトウェアと連携し、視聴者からのSuperCHAT通知をオーバーレイ表示する機能などを提供します。

## 機能

- OBSブラウザソース連携 (リアルタイムSuperCHAT表示)
- SUIウォレットアドレス設定 (SuperCHAT受け取り用)
- 配信セッションごとのメッセージ・SuperCHAT履歴表示
- ローカルWebSocketサーバーによる視聴者フロントエンドとの連携
- Cloudflare Tunnel を使用した外部からのアクセス

## 必要なもの

- パソコン (Windows 10/11 または macOS 10.15以降)
- インターネット接続

## インストール方法

### ステップ1: アプリケーションをダウンロードする

1. **GitHubのリリースページにアクセス:**
   - ウェブブラウザで [SUIperCHATのリリースページ](https://github.com/UnagiLabs/SUIperCHAT/releases) にアクセスします。
   - 最新版（Latest）のリリースを探します。

2. **お使いのOSに合ったファイルをダウンロード:**
   - **Windows の場合**: `SUIperCHAT_x.x.x_x64_en-US.msi` または `SUIperCHAT_x.x.x_x64-setup.exe` をダウンロード
   - **macOS の場合**: `SUIperCHAT_x.x.x_aarch64.dmg` (Apple Silicon) または `SUIperCHAT_x.x.x_x64.dmg` (Intel) をダウンロード
   - お使いのMacのプロセッサ種類がわからない場合は、画面左上のアップルマーク → 「このMacについて」で確認できます。

### ステップ2: セキュリティ警告を回避してインストールする

ダウンロードしたアプリケーションは、セキュリティ保護のため初回起動時に警告が表示される場合があります。以下の手順で安全にインストールできます。

#### Windows の場合

1. **インストーラーを実行:**
   - ダウンロードした `.msi` または `.exe` ファイルをダブルクリックします。
   - 「WindowsによってPCが保護されました」という警告が表示される場合があります。

2. **セキュリティ警告を回避:**
   - 警告画面で「詳細情報」をクリックします。
   - 「実行」ボタンが表示されるので、クリックしてインストールを続行します。
   - インストーラーの指示に従ってインストールを完了します。

3. **初回起動時の警告対処:**
   - インストール後、アプリを初めて起動する際にも警告が出る場合は、同様に「詳細情報」→「実行」を選択します。

#### macOS の場合

1. **DMGファイルを開く:**
   - ダウンロードした `.dmg` ファイルをダブルクリックします。
   - 開いたウィンドウで `SUIperCHAT.app` を `/Applications` フォルダにドラッグ＆ドロップします。

2. **セキュリティ警告を回避（推奨方法 - ターミナル）:**
   - ターミナルを開きます（Launchpadで「ターミナル」と検索、または「アプリケーション」→「ユーティリティ」→「ターミナル」）。
   - 以下のコマンドをコピーして貼り付け、Enterキーを押して実行します：
     ```bash
     xattr -cr /Applications/SUIperCHAT.app
     ```
   - コマンド実行後、通常通りアプリケーションをダブルクリックで起動できます。
   - **注意**: このコマンドは、アプリケーションの隔離属性を削除し、macOSのGatekeeperによる制限を回避します。

3. **その他の方法（macOSのバージョンによっては利用できない場合があります）:**
   - **右クリックで開く**: アプリを右クリック（またはControlキーを押しながらクリック）して「開く」を選択する方法
   - **システム設定から許可**: システム設定の「セキュリティとプライバシー」で許可する方法
   - ※ これらの方法は、macOSのバージョンやセキュリティ設定によっては表示されない場合があります。その場合は上記のターミナルを使用する方法をお試しください。

## アプリケーションの使い方 (インストール後)

アプリケーションのインストールが完了したら、以下の手順で起動して設定を行い、配信に連携します。

1.  インストールした SuiperCHAT Streamer App を起動します。Windowsの場合はスタートメニューから、macOSの場合はアプリケーションフォルダから起動できます。
2.  アプリが起動したら、画面の指示に従って初期設定を行います。
3.  **SUIウォレットアドレスの設定**:
    *   アプリ内の設定画面を探し、「SUIウォレットアドレス」または同様の項目にご自身のSUIウォレットアドレス（スーパーチャットを受け取るためのアドレス）を入力します。これは、視聴者から送られたスーパーチャットを受け取るために必要です。
4.  **(任意) OBS表示のカスタマイズ**:
    *   もしOBSでのスーパーチャット表示の見た目（色やフォントなど）を変更したい場合は、設定画面で関連する項目を探して調整します。
5.  **サーバーの開始**:
    *   アプリのメイン画面にある「サーバー開始」や「Start Server」といったボタンをクリックします。これにより、視聴者がスーパーチャットを送るための通信が開始されます。
6.  **OBSへの設定**:
    *   アプリ内に「OBS用URL」や「Browser Source URL」といったURLが表示されます。このURLをコピーします。
    *   お使いの配信ソフト（OBS Studioなど）を開きます。
    *   「ソース」セクションで「+」ボタンを押し、「ブラウザ」または「Browser」ソースを追加します。
    *   プロパティ画面が表示されたら、「URL」欄に、先ほどコピーしたURLを貼り付けます。
    *   「幅」と「高さ」を、ご自身の配信画面でスーパーチャットを表示したいエリアのサイズに合わせて調整します（例: 幅 1920, 高さ 1080）。
    *   「OK」を押して設定を完了します。OBSの画面にスーパーチャットの表示エリアが現れます。このエリアを配信画面の好きな位置に配置してください。
7.  **視聴者へのURL共有**:
    *   アプリ内に「視聴者用URL」や「Viewer URL」といったURLが表示されます。このURLをコピーします。
    *   このURLを、YouTubeの概要欄など、視聴者が見られる場所に貼り付けて共有します。視聴者はこのURLからスーパーチャットを送ることができます。

---

# SuiperCHAT Streamer App (English)

The SuiperCHAT Streamer App is a desktop application for streamers using the SuiperCHAT service. It integrates with streaming software like OBS to provide features such as overlay display of viewer SuperCHAT notifications.

## Features

- OBS Integration: Display SuperCHAT notifications as a browser source in OBS and other streaming software.
- Wallet Configuration: Set your Sui wallet address to receive SuperCHATs.
- View past SuperCHAT history per stream session.
- Integration with the viewer frontend via a local WebSocket server.
- External access via Cloudflare Tunnel.

## Requirements

- Computer (Windows 10/11 or macOS 10.15 or later)
- Internet connection

## Installation

### Step 1: Download the Application

1. **Access the GitHub Releases Page:**
   - Visit the [SUIperCHAT Releases page](https://github.com/UnagiLabs/SUIperCHAT/releases) in your web browser.
   - Look for the latest release.

2. **Download the File for Your OS:**
   - **For Windows**: Download `SUIperCHAT_x.x.x_x64_en-US.msi` or `SUIperCHAT_x.x.x_x64-setup.exe`
   - **For macOS**: Download `SUIperCHAT_x.x.x_aarch64.dmg` (Apple Silicon) or `SUIperCHAT_x.x.x_x64.dmg` (Intel)
   - If you're unsure about your Mac's processor type, click the Apple menu → "About This Mac" to check.

### Step 2: Bypass Security Warnings and Install

Downloaded applications may show security warnings on first launch. Follow these steps to safely install the app.

#### For Windows

1. **Run the Installer:**
   - Double-click the downloaded `.msi` or `.exe` file.
   - You may see a "Windows protected your PC" warning.

2. **Bypass Security Warning:**
   - Click "More info" on the warning screen.
   - Click the "Run anyway" button that appears.
   - Follow the installer instructions to complete installation.

3. **First Launch Warning:**
   - If a warning appears when first launching the app after installation, similarly choose "More info" → "Run anyway".

#### For macOS

1. **Open the DMG File:**
   - Double-click the downloaded `.dmg` file.
   - Drag `SUIperCHAT.app` to the `/Applications` folder in the window that opens.

2. **Bypass Security Warning (Recommended - Terminal):**
   - Open Terminal (search for "Terminal" in Launchpad, or go to "Applications" → "Utilities" → "Terminal").
   - Copy and paste the following command, then press Enter:
     ```bash
     xattr -cr /Applications/SUIperCHAT.app
     ```
   - After running the command, you can launch the app normally by double-clicking.
   - **Note**: This command removes the quarantine attribute from the application, bypassing macOS Gatekeeper restrictions.

3. **Alternative Methods (May not be available on all macOS versions):**
   - **Right-click to open**: Right-click (or Control-click) the app and select "Open"
   - **System Settings approval**: Approve in System Settings under "Security & Privacy"
   - ※ These methods may not appear depending on your macOS version and security settings. If they don't work, please use the Terminal method above.

## How to Use the Application (After Installation)

Once the application is installed, follow these steps to launch it, configure settings, and integrate it with your stream.

1.  Launch the installed SuiperCHAT Streamer App. You can launch it from the Start Menu on Windows or from the Applications folder on macOS.
2.  After the app launches, follow the on-screen instructions for initial setup.
3.  **Set Your SUI Wallet Address**:
    *   Find the settings screen within the app and enter your SUI wallet address (the address where you want to receive SuperCHATs) in the field labeled "SUI Wallet Address" or similar. This is necessary to receive SuperCHATs sent by viewers.
4.  **(Optional) Customize OBS Display**:
    *   If you want to change the appearance (like color or font) of the SuperCHAT display in OBS, find the relevant settings in the app and adjust them.
5.  **Start the Server**:
    *   Click the button labeled "サーバー開始" or "Start Server" on the app's main screen. This will start the communication required for viewers to send SuperCHATs.
6.  **Configure in OBS**:
    *   An "OBS用URL" or "Browser Source URL" will be displayed within the app. Copy this URL.
    *   Open your streaming software (like OBS Studio).
    *   In the "Sources" section, click the "+" button and add a "Browser" source.
    *   In the properties window that appears, paste the URL you copied into the "URL" field.
    *   Adjust the "Width" and "Height" to match the size of the area where you want to display SuperCHATs on your stream screen (e.g., Width 1920, Height 1080).
    *   Click "OK" to complete the setup. The SuperCHAT display area will appear on your OBS screen. You can position this area anywhere you like on your stream layout.
7.  **Share the URL with Viewers**:
    *   A "視聴者用URL" or "Viewer URL" will be displayed within the app. Copy this URL.
    *   Paste and share this URL in a place where your viewers can see it, such as your YouTube description panels. Viewers can use this URL to send SuperCHATs.
