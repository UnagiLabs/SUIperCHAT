# SuiperCHAT Streamer App

SuiperCHAT Streamer App は、SuiperCHAT サービスを利用するストリーマー向けのデスクトップアプリケーションです。OBSなどの配信ソフトウェアと連携し、視聴者からのSuperCHAT通知をオーバーレイ表示する機能などを提供します。

## 機能

- OBSブラウザソース連携 (リアルタイムSuperCHAT表示)
- SUIウォレットアドレス設定 (SuperCHAT受け取り用)
- 配信セッションごとのメッセージ・SuperCHAT履歴表示
- ローカルWebSocketサーバーによる視聴者フロントエンドとの連携
- Cloudflare Tunnel を使用した外部からのアクセス (ws_server/tunnel.rs から推測)
- (必要に応じてファイル構造から読み取れる詳細機能を追加)

## 技術的な背景（かんたん解説）

このアプリは、いくつかの現代的な技術を使って作られています。裏側では「Rust」というプログラミング言語が動いていて、画面表示にはウェブ技術（Next.js, React）が使われています。「Tauri」という仕組みで、これらが一つのデスクトップアプリとしてまとまっています。

## 必要なもの

- パソコン (Windows または macOS)
- インターネット接続
- Windows では Visual Studio Build Tools（C++ Build Tools）をインストール
- macOS では Xcode Command Line Tools をインストール

## セットアップ (使い方)

### ステップ1: 必要なツールをインストールする

SuiperCHAT Streamer App をソースコードからビルドしてインストールするためには、いくつかのツールが必要です。お使いのOSに合わせて以下の手順でインストールしてください。

#### Windows の場合

1.  **Rust のインストール:**
    *   ウェブブラウザで [rustup.rs](https://rustup.rs/) にアクセスします。
    *   「Download rustup-init.exe」ボタンをクリックしてインストーラーをダウンロードします。
    *   ダウンロードした `rustup-init.exe` を実行します。
    *   コマンドプロンプトのような画面が表示されます。ほとんどの場合、デフォルト設定で問題ありません。`1` を入力して Enter キーを押し、インストールを開始します。
    *   インストールが完了したら、画面の指示に従ってコマンドプロンプトを再起動するか、新しいコマンドプロンプトを開いてください。
2.  **Node.js のインストール:**
    *   ウェブブラウザで [Node.js 公式サイト](https://nodejs.org/) にアクセスします。
    *   推奨版 (LTS - Long Term Support) のインストーラーをダウンロードします。
    *   ダウンロードしたインストーラーを実行し、画面の指示に従ってデフォルト設定でインストールします。
3.  **Tauri CLI のインストール:**
    *   コマンドプロンプトを開き、以下のコマンドをコピーして貼り付け、Enter キーを押して実行します。
        ```bash
        cargo install tauri-cli
        ```
    *   インストールには少し時間がかかる場合があります。完了するまでお待ちください。

#### macOS の場合

1.  **Rust のインストール:**
    *   「ターミナル」アプリケーションを開きます。（Launchpadで「ターミナル」と検索するか、「アプリケーション」→「ユーティリティ」フォルダ内にあります。）
    *   ターミナルに以下のコマンドをコピーして貼り付け、Enter キーを押して実行します。
        ```bash
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
        ```
    *   画面の指示に従い、デフォルト設定でインストールします。プロンプトが表示されたら `1` を入力して Enter キーを押してください。
    *   インストールが完了したら、ターミナルで以下のコマンドを実行するか、ターミナルを一度閉じて再度開いてください。
        ```bash
        source $HOME/.cargo/env
        ```
2.  **Node.js のインストール:**
    *   ウェブブラウザで [Node.js 公式サイト](https://nodejs.org/) にアクセスします。
    *   推奨版 (LTS - Long Term Support) のインストーラーをダウンロードします。
    *   ダウンロードしたインストーラーを実行し、画面の指示に従ってデフォルト設定でインストールします。
    *   (もし Homebrew を利用している場合は、ターミナルで `brew install node` コマンドでもインストールできます。)
3.  **Tauri CLI のインストール:**
    *   ターミナルを開き、以下のコマンドをコピーして貼り付け、Enter キーを押して実行します。
        ```bash
        cargo install tauri-cli
        ```
    *   インストールには少し時間がかかる場合があります。完了するまでお待ちください。

### ステップ2: SuiperCHAT Streamer App をダウンロードして準備する

1.  **リポジトリをダウンロード（クローン）します:**
    *   ターミナル（macOS）またはコマンドプロンプト（Windows）を開き、アプリケーションのファイルを置きたいディレクトリに移動します。（例: デスクトップなど）
    *   以下のコマンドをコピーして貼り付け、Enter キーを押して実行します。
        ```bash
        git clone https://github.com/UnagiLabs/SUIperCHAT
        ```
    *   これにより、`SUIperCHAT` という名前のフォルダが作成され、その中にアプリのファイルがダウンロードされます。
2.  **アプリケーションのディレクトリに移動します:**
    *   ダウンロードした `SUIperCHAT` フォルダの中にある `suiperchat_streamer_app` フォルダに移動します。ターミナルまたはコマンドプロンプトで以下のコマンドを実行します。
        ```bash
        cd SUIperCHAT/suiperchat_streamer_app
        ```
3.  **必要な部品（依存関係）をインストールします:**
    *   アプリケーションが動作するために必要な追加の部品をインストールします。`suiperchat_streamer_app` ディレクトリにいることを確認し、以下のコマンドをコピーして貼り付け、Enter キーを押して実行します。
        ```bash
        npm install
        ```
    *   インストールには数分かかる場合があります。完了するまでお待ちください。

### ステップ3: アプリケーションをビルドしてインストールする

必要なツールのインストールとソースコードの準備ができたら、アプリケーションをビルドしてパソコンにインストールします。

1.  **アプリケーションをビルドします:**
    *   ターミナル（macOS）またはコマンドプロンプト（Windows）で、`suiperchat_streamer_app` ディレクトリにいることを確認し、以下のコマンドをコピーして貼り付け、Enter キーを押して実行します。
```bash
npm run tauri build
```
    *   `npm run tauri build` を実行すると、内部で Next.js のビルド (`npm run build`) も自動的に行われます。そのため、`npm run build` を個別に実行する必要はありません。
    *   このコマンドは、アプリケーションのリリース版をビルドします。ビルドには時間がかかる場合があります。
    *   ビルドが成功すると、インストーラーファイルが以下のディレクトリに生成されます。
        *   Windows: `suiperchat_streamer_app/src-tauri/target/release/bundle/msi` または `suiperchat_streamer_app/src-tauri/target/release/bundle/nsis` (`.msi` または `.exe` ファイル)
        *   macOS: `suiperchat_streamer_app/src-tauri/target/release/bundle/dmg` (`.dmg` ファイル) または `suiperchat_streamer_app/src-tauri/target/release/bundle/macos` (`.app` ファイル)
2.  **アプリケーションをインストールします:**
    *   生成されたインストーラーファイル（Windowsの場合は `.msi` または `.exe`、macOSの場合は `.dmg` または `.app`）を見つけて実行します。
    *   画面の指示に従って、アプリケーションをパソコンにインストールしてください。インストール手順は通常のアプリケーションと同様です。

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
    *   このURLを、YouTubeの概要欄やTwitchのパネルなど、視聴者が見られる場所に貼り付けて共有します。視聴者はこのURLからスーパーチャットを送ることができます。

## トラブルシューティング / FAQ

(必要に応じて追記)

---

# SuiperCHAT Streamer App (English)

The SuiperCHAT Streamer App is a desktop application for streamers using the SuiperCHAT service. It integrates with streaming software like OBS to provide features such as overlay display of viewer SuperCHAT notifications.

## Features

- OBS Integration: Display SuperCHAT notifications as a browser source in OBS and other streaming software.
- Wallet Configuration: Set your Sui wallet address to receive SuperCHATs.
- View past SuperCHAT history per stream session.
- Integration with the viewer frontend via a local WebSocket server.
- External access via Cloudflare Tunnel (inferred from ws_server/tunnel.rs).
- (Add more detailed features based on file structure if necessary)

## Technical Background (Simple Explanation)

This app is built using several modern technologies. It uses the "Rust" programming language on the backend, and web technologies (Next.js, React) for the user interface. "Tauri" is used to package these together into a single desktop application.

## Requirements

- Computer (Windows or macOS)
- Internet connection

## Setup (How to Use)

### Step 1: Install Necessary Tools

To build and install the SuiperCHAT Streamer App from source code, you need to install a few tools. Please follow the instructions below based on your operating system.

#### For Windows

1.  **Install Rust:**
    *   Visit [rustup.rs](https://rustup.rs/) in your web browser.
    *   Click the "Download rustup-init.exe" button to download the installer.
    *   Run the downloaded `rustup-init.exe`.
    *   A command prompt-like window will appear. In most cases, the default settings are fine. Type `1` and press Enter to start the installation.
    *   Once the installation is complete, please restart your command prompt or open a new one as instructed.
2.  **Install Node.js:**
    *   Visit the [official Node.js website](https://nodejs.org/) in your web browser.
    *   Download the recommended version (LTS - Long Term Support) installer.
    *   Run the downloaded installer and follow the on-screen instructions to install with default settings.
3.  **Install Tauri CLI:**
    *   Open a command prompt and copy and paste the following command, then press Enter to run it.
        ```bash
        cargo install tauri-cli
        ```
    *   The installation may take some time. Please wait for it to complete.

#### For macOS

1.  **Install Rust:**
    *   Open the "Terminal" application. (You can search for "Terminal" in Launchpad or find it in the "Applications" -> "Utilities" folder.)
    *   Copy and paste the following command into the terminal and press Enter to run it.
        ```bash
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
        ```
    *   Follow the on-screen instructions to install with default settings. When prompted, type `1` and press Enter.
    *   After the installation is complete, run the following command in the terminal or close and reopen the terminal:
        ```bash
        source $HOME/.cargo/env
        ```
2.  **Install Node.js:**
    *   Visit the [official Node.js website](https://nodejs.org/) in your web browser.
    *   Download the recommended version (LTS - Long Term Support) installer.
    *   Run the downloaded installer and follow the on-screen instructions to install with default settings.
    *   (If you use Homebrew, you can also install it by running `brew install node` in the terminal.)
3.  **Install Tauri CLI:**
    *   Open a terminal and copy and paste the following command, then press Enter to run it.
        ```bash
        cargo install tauri-cli
        ```
    *   The installation may take some time. Please wait for it to complete.

### Step 2: Download and Prepare the SuiperCHAT Streamer App

1.  **Download (Clone) the Repository:**
    *   Open a terminal (macOS) or command prompt (Windows) and navigate to the directory where you want to place the application files (e.g., your Desktop).
    *   Copy and paste the following command and press Enter to run it.
        ```bash
        git clone https://github.com/UnagiLabs/SUIperCHAT
        ```
    *   This will create a folder named `SUIperCHAT` and download the app files into it.
2.  **Navigate to the Application Directory:**
    *   Move into the `suiperchat_streamer_app` folder located inside the downloaded `SUIperCHAT` folder. Run the following command in your terminal or command prompt.
        ```bash
        cd SUIperCHAT/suiperchat_streamer_app
        ```
3.  **Install Necessary Components (Dependencies):**
    *   Install the additional components required for the application to run. Make sure you are in the `suiperchat_streamer_app` directory and copy and paste the following command, then press Enter to run it.
        ```bash
        npm install
        ```
    *   The installation may take a few minutes. Please wait for it to complete.

### Step 3: Build and Install the Application

Once you have installed the necessary tools and prepared the source code, you can build and install the application on your computer.

1.  **Build the Application:**
    *   In your terminal (macOS) or command prompt (Windows), ensure you are in the `suiperchat_streamer_app` directory and copy and paste the following command, then press Enter to run it.
        ```bash
        npm run tauri build
        ```
    *   Running `npm run tauri build` also triggers the Next.js build step (`npm run build`) automatically, so you do not need to run `npm run build` separately.
    *   This command will build the release version of the application. The build process might take some time.
    *   If the build is successful, an installer file will be generated in the following directory:
        *   Windows: `suiperchat_streamer_app/src-tauri/target/release/bundle/msi` or `suiperchat_streamer_app/src-tauri/target/release/bundle/nsis` (a `.msi` or `.exe` file)
        *   macOS: `suiperchat_streamer_app/src-tauri/target/release/bundle/dmg` (a `.dmg` file) or `suiperchat_streamer_app/src-tauri/target/release/bundle/macos` (a `.app` file)
2.  **Install the Application:**
    *   Locate the generated installer file (the `.msi` or `.exe` file on Windows, or the `.dmg` or `.app` file on macOS) and run it.
    *   Follow the on-screen instructions to install the application on your computer. The installation process is similar to installing any other application.

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
    *   Paste and share this URL in a place where your viewers can see it, such as your YouTube description or Twitch panels. Viewers can use this URL to send SuperCHATs.

## Troubleshooting / FAQ

(Add if necessary)
