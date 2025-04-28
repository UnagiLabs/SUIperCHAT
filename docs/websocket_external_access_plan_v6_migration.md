# WebSocketサーバー外部アクセス対応 実装計画 v6.0 (Cloudflare Quick Tunnels 移行版)

**改訂のポイント:**

*   外部公開メカニズムを Loophole から **Cloudflare Quick Tunnels** (`cloudflared`) に全面的に置き換えます。
*   既存計画 (v5.1) の実装済み資産（IP取得、CGNAT判定など）は可能な限り流用しつつ、`cloudflared` 連携に必要な箇所を修正・追加します。
*   Tauri v2 の `tauri-plugin-shell` を引き続き利用して `cloudflared` をサイドカーとして管理します。
*   v5.1 のステップ 6-8 までが完了している前提で、その状態から v6.0 へ移行するための手順を明確にします。

---

**1. 目標 (変更)**

1.  `suiperchat_streamer_app` の WebSocket サーバーを `127.0.0.1` で待受けし、**Cloudflare Quick Tunnel 経由のみ**で外部公開します。
2.  外部 IP 多段取得・CGNAT 自動判定・UI 警告機能は維持します。（v5.1 の実装を流用）
3.  **`cloudflared` バイナリをアプリに同梱**し、サーバー起動時に Quick Tunnel を自動生成します。
    *   取得した HTTPS URL (`https://*.trycloudflare.com`) をパースし、フロントエンドへ通知します。クライアントは対応する WSS URL (`wss://*.trycloudflare.com/ws`) で接続します。
    *   Quick Tunnel は再起動時に再生成されます（一時的なトンネルのため）。

---

**2. 環境変数 (変更)**

| 変数名                  | 既定値                                                           | 説明                                                                         | 変更点                     |
| :---------------------- | :--------------------------------------------------------------- | :--------------------------------------------------------------------------- | :------------------------- |
| `WS_BIND_ADDR`          | `127.0.0.1`                                                      | WebSocket Listen アドレス                                                    | 変更なし                   |
| `WS_PORT`               | `8082`                                                           | WebSocket Listen ポート                                                      | 変更なし                   |
| `OBS_PORT`              | `8081`                                                           | OBS 静的サーバーポート                                                       | 変更なし                   |
| `EXTERNAL_IP_ENDPOINTS` | `https://api.ipify.org?format=json,https://ifconfig.me/all.json` | カンマ区切りで使用する外部IP取得API                                          | 変更なし                   |
| **`CLOUDFLARED_PATH`**  | `cloudflared`                                                    | **同梱された `cloudflared` CLI 実行ファイル名**                              | **`LOOPHOLE_CLI_PATH` から変更** |
| **`CLOUDFLARED_EXTRA_ARGS`** | (空)                                                          | **`cloudflared tunnel` への追加引数 (例: `--loglevel debug`, `--protocol http2`)** | **新規追加**               |

---

**3. ファイル構成 (変更)**

```diff
 src-tauri/
  ├─ src/ws_server/
  │   ├─ server_manager.rs   ← cloudflared 起動/停止呼び出しに修正
- │   ├─ tunnel.rs           ← Loophole Sidecar 制御
+ │   ├─ tunnel.rs           ← cloudflared Sidecar 制御 (URLパース含む)
  │   └─ ip_utils.rs         ← 変更なし (流用)
  ├─ src/state.rs            ← AppState に tunnel 情報保持フィールドを追加/変更
  ├─ Cargo.toml              ← 依存関係は基本的に変更なし (regex, once_cell は維持)
  ├─ tauri.conf.json         ← externalBin を cloudflared に変更
  ├─ capabilities/
  │   ├─ http.json           ← 変更なし (流用)
- │   └─ shell.json          ← loophole 許可設定
+ │   └─ shell.json          ← cloudflared 許可設定に変更
- ├─ binaries/loophole-*     ← Loophole バイナリ削除
- ├─ binaries/LICENSE        ← Loophole ライセンス削除
+ ├─ binaries/cloudflared-*  ← 各プラットフォーム用 cloudflared バイナリ追加 (GitHub Releases から)
+ ├─ binaries/LICENSE        ← cloudflared ライセンス (Apache-2.0) 追加
  └─ ... (build.rs などは変更なし)
```

---

**4. 依存ライブラリ**

v5.1 から変更なし。`regex`, `once_cell` など、トンネル出力のパースに必要なクレートは引き続き使用します。

```toml
# 変更なし (v5.1 と同様)
[dependencies]
tauri              = { version = "2", default-features = false }
tauri-plugin-http  = "2"
tauri-plugin-shell = "2"
actix-web          = { version = "4" }
local-ip-address   = "0.6"
if-addrs           = "0.11"
serde              = { version = "1", features = ["derive"] }
serde_json         = "1"
stun_client        = "0.4"
tracing            = "0.1"
tracing-subscriber = { version = "0.3", features = ["json", "env-filter"] }
tokio              = { version = "1", features = ["rt-multi-thread", "macros", "process"] }
regex              = "1" # cloudflared 出力パースに必要
once_cell          = "1" # static regex に必要
```

---

**5. アーキテクチャ (Mermaid 変更)**

```mermaid
graph TD
    subgraph BackEnd ["Backend (Rust/Tauri)"]
        A[server_manager<br/>bind(WS_BIND_ADDR, WS_PORT)] --> B{外部IP取得<br/>(ip_utils.rs)};
        B -- Success --> C[外部IP 保存];
        B -- Failure --> D[127.0.0.1 + flag];
        C & D --> E[emit_server_status];
        E --> F[Frontend (UI)];

        subgraph NAT判定 ["NAT & CGNAT Detection"]
            G[STUN Query<br/>(ip_utils.rs)] --> H{一致?};
            H -- Mismatch --> I[CGNAT=true → UI警告];
        end
        C --> G; # Trigger STUN after getting external IP

        subgraph Cloudflare_Tunnel ["Cloudflare Tunneling (tunnel.rs)"]
           J[server_manager calls<br/>start_tunnel] --> K{Spawn cloudflared<br/>Sidecar};
           K -- Success --> L[cloudflared process<br/>`tunnel --url http://127.0.0.1:${WS_PORT}`];
           L -- stdout --> M[Parse HTTPS URL<br/>`https://*.trycloudflare.com`];
           M --> N[Save TunnelInfo<br/>(URL + Process Handle)];
           N -.-> E; # Provide URL to status update
           O[server_manager calls<br/>stop_tunnel] --> P[Kill cloudflared<br/>process];
           N --> O; # Trigger stop on shutdown
        end
        A --> J; # Start tunnel with server
    end

    subgraph OBS_Server ["OBS Static Server"]
        Q[obs_server<br/>bind(127.0.0.1, OBS_PORT)];
    end

    subgraph Config ["Tauri Configuration"]
       R[tauri.conf.json] --> S[externalBin: cloudflared];
       R --> T[plugins: http, shell];
       U[capabilities/shell.json<br/>allow: cloudflared] -.-> S;
       V[capabilities/http.json<br/>allow: IP APIs] -.-> T;
    end

    subgraph Binaries ["Bundled Binaries"]
      W[binaries/cloudflared-*];
      X[binaries/LICENSE];
      W & X -.-> S;
    end

```

---

**6. 実装ステップ (v5.1 の 6-8 完了からの移行)**

既存の Loophole 関連実装 (主に `tunnel.rs` と `server_manager.rs` 内の呼び出し部分、`AppState` の一部) を `cloudflared` 用に置き換える作業が中心となります。

**前提:** v5.1 のステップ 6-1 ～ 6-4 (バイナリ準備、Tauri設定、IP取得、CGNAT判定の基本部分) は完了しているが、Loophole 固有の設定は削除・変更が必要です。6-5 ～ 6-8 (Tunnel構造体、起動・停止、server_manager統合) は Loophole 用の実装が存在するため、これを `cloudflared` 用に書き換えます。

---

### **ステップ 6.1: `cloudflared` バイナリ準備とライセンス**

*   **実施内容:**
    *   既存の `src-tauri/binaries/loophole-*` と `LICENSE` (Loophole用) を削除します。
    *   Cloudflare の GitHub Releases ([https://github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases)) から、ターゲットプラットフォーム (例: `windows-amd64.exe`, `darwin-amd64`, `darwin-arm64`) 用の `cloudflared` バイナリをダウンロードします。
    *   ダウンロードしたバイナリを `src-tauri/binaries/` に配置します。**ファイル名は Tauri の命名規則 `{externalBin}-{target}` に従う必要があります** (例: `cloudflared-aarch64-apple-darwin`, `cloudflared-x86_64-pc-windows-msvc.exe`)。Tauri はビルド時にターゲットに応じたファイルを自動で選択します。
    *   `cloudflared` のリポジトリから `LICENSE` ファイル (Apache-2.0) を取得し、`src-tauri/binaries/LICENSE` として配置します。
    *   macOS/Linux 用バイナリには実行権限を付与します (`chmod +x`)。CI/CD で `strip` コマンドによるバイナリサイズ削減も検討します。
*   **検証:** `cargo tauri build` 後、アプリバンドル内に `cloudflared` バイナリと Apache-2.0 ライセンスが含まれていることを確認。
*   **コミット:** `[feat] Loopholeバイナリをcloudflaredバイナリとライセンスに置換`

### **ステップ 6.2: Tauri 設定更新 (`tauri.conf.json`, Capabilities)**

*   **実施内容:**
    *   `tauri.conf.json` を開き、`bundle.externalBin` に**バイナリのベース名** (`"cloudflared"`) を指定します。Tauri はビルド時にこのベース名とターゲット情報から、対応するバイナリファイル (`binaries/cloudflared-{target}`) を自動的に探し、バンドルに含めます。
        ```jsonc
        // tauri.conf.json (修正例)
        "bundle": {
          // "identifier": "...",
          "externalBin": ["cloudflared"] // ベース名を指定
        },
        "plugins": { "shell": {}, "http": {} } // 変更なし
        ```
    *   `capabilities/shell.json` を開き、`shell:allow-spawn` の許可リストを `loophole` から `cloudflared` に変更します。**`allow` 配列内のオブジェクトでは、キーとして `"name"` を使用します。**
        ```jsonc
        // capabilities/shell.json (修正)
        {
          "$schema":"../gen/schemas/desktop-schema.json",
          "identifier":"shell-cap",
          "permissions":[
            {
              "identifier":"shell:allow-spawn",
              "allow":[{"name": "cloudflared", "sidecar": true}] // キーは "name"
            }
          ]
        }
        ```
    *   `capabilities/http.json` は IP 取得 API 用なので変更不要です。
*   **検証:** `cargo tauri build` が成功すること。アプリ起動時に Capability 関連のエラーが出ないこと。**推奨:** `cargo tauri config lint` を実行し、Capability ファイルの構文、スキーマ、配置場所 (`src-tauri/capabilities/`) が正しいか事前に検証します。
*   **コミット:** `[feat] cloudflaredサイドカー用にTauri設定とCapabilityを更新`

### **ステップ 6.3: `AppState` 更新**

*   **実施内容:**
    *   `src/state.rs` の `AppState` 構造体を変更します。
    *   Loophole 用のトンネル情報 (`loophole_info: Arc<Mutex<Option<Result<TunnelInfo, TunnelError>>>>` など) を削除または `cloudflared` 用にリネーム/変更します。
    *   新しいフィールドとして、例えば `tunnel_info: Arc<Mutex<Option<Result<TunnelInfo, TunnelError>>>>` を定義します。`TunnelInfo` と `TunnelError` の定義も後続ステップで `cloudflared` 用に調整します。
*   **検証:** コンパイルが通ること。
*   **コミット:** `[refactor] cloudflaredトンネル情報用にAppStateを更新`

### **ステップ 6.4: `TunnelInfo` 構造体と `TunnelError` 更新 (`tunnel.rs`)**

*   **実施内容:**
    *   `src/ws_server/tunnel.rs` を開きます。
    *   `TunnelInfo` 構造体を定義します。`cloudflared` プロセスを管理するための `CommandChild` と、取得した Quick Tunnel URL (`https://*.trycloudflare.com`) を保持するようにします。`Arc<Mutex<>>` でラップするのは v5.1 と同様です。
        ```rust
        // src/ws_server/tunnel.rs (変更)
        use tauri_plugin_shell::process::CommandChild;
        use std::sync::{Arc, Mutex};

        #[derive(Debug)] // Debug トレイトを追加すると便利
        pub struct TunnelInfo {
            pub process: Arc<Mutex<Option<CommandChild>>>, // Option で包むことで take 可能に
            pub url: String, // 取得した cloudflare URL (e.g., https://xxx.trycloudflare.com)
        }

        #[derive(Debug, thiserror::Error)] // エラー型を明確に
        pub enum TunnelError {
            #[error("Failed to select cloudflared binary for this platform")]
            BinarySelectionFailed,
            #[error("Failed to spawn cloudflared process: {0}")]
            SpawnFailed(#[from] tauri_plugin_shell::Error),
            #[error("Failed to read cloudflared stdout")]
            StdioError,
            #[error("Cloudflare URL not found in output within timeout")]
            UrlNotFound,
            #[error("Timed out waiting for cloudflared URL")]
            Timeout,
            #[error("Unsupported platform")]
            UnsupportedPlatform, // 念のため残す
            // 必要に応じて他のエラー種別を追加
        }
        ```
    *   `TunnelError` enum も `cloudflared` 関連のエラーを表現できるように更新します (`thiserror` クレートを使うと便利です)。
*   **検証:** コンパイルが通ること。
*   **コミット:** `[refactor] cloudflared用にTunnelInfo構造体とTunnelError Enumを更新`

### **ステップ 6.5: `start_tunnel` 実装更新 (`tunnel.rs`)**

*   **実施内容:**
    *   `tunnel.rs` の `start_tunnel` 関数を `cloudflared` を起動するように全面的に書き換えます。
    *   プラットフォーム固有のバイナリ選択ロジック (`select_cloudflared_binary` 関数のようなもの) は**不要**です。
    *   `app.shell().sidecar()` には**バイナリのベース名** (`"cloudflared"`) を渡して `cloudflared` を起動します。Tauri は実行時に現在のプラットフォームに適したバイナリ (`binaries/cloudflared-{target}`) を自動的に解決し、実行します (Windows では `.exe` も自動で考慮されます)。引数には `tunnel`, `--url`, `http://127.0.0.1:{ws_port}`, `--no-autoupdate` を含めます。環境変数 `CLOUDFLARED_EXTRA_ARGS` の内容も追加します。
    *   `cloudflared` の**標準出力 (stdout) および標準エラー出力 (stderr) の両方**を非同期に監視し、`https?://[a-z0-9-]+.trycloudflare.com` の形式の URL を正規表現 (`regex`, `once_cell`) で抽出します (URL は stderr にも出力される場合があるため)。
    *   URL が見つかったら、`child` プロセスハンドルと共に `TunnelInfo` を生成して `Ok` で返します。
    *   一定時間内に URL が見つからなければタイムアウトエラー (`TunnelError::Timeout` または `TunnelError::UrlNotFound`) を返します。
        ```rust
        // src/ws_server/tunnel.rs (start_tunnel の実装例)
        use tauri::{AppHandle, Manager};
        use tokio::io::{AsyncBufReadExt, BufReader};
        use tokio::sync::mpsc;
        use regex::Regex;
        use once_cell::sync::Lazy;
        use std::time::Duration;
        use tauri_plugin_shell::{ShellExt, CommandEvent}; // CommandEvent も必要

        static CF_URL_RE: Lazy<Regex> = Lazy::new(|| {
            Regex::new(r"https?://[a-z0-9-]+\.trycloudflare\.com").expect("Invalid regex")
        });
        const STARTUP_TIMEOUT: Duration = Duration::from_secs(15); // タイムアウト設定

        // バイナリ選択ロジック (例)
        pub async fn start_tunnel(app: &AppHandle, ws_port: u16) -> Result<TunnelInfo, TunnelError> {
            // Tauri がターゲットバイナリを解決するため、OS判定やパス選択は不要

            let mut args = vec![
                "tunnel".to_string(),
                "--url".to_string(),
                format!("http://127.0.0.1:{}", ws_port),
                "--no-autoupdate".to_string(), // 自動更新を無効化
                "--no-autoupdate".to_string(), // 自動更新を無効化
                // TODO: (config.yaml 競合対策) 必要であれば "--config", "" を追加する検討
            ];

            // 環境変数から追加引数を取得して追加
            if let Ok(extra_args_str) = std::env::var("CLOUDFLARED_EXTRA_ARGS") {
                if !extra_args_str.is_empty() {
                    args.extend(extra_args_str.split_whitespace().map(String::from));
                }
            }
             if let Ok(log_level) = std::env::var("CLOUDFLARED_LOG_LEVEL") {
                 args.push("--loglevel".to_string());
                 args.push(log_level);
            }


            // .sidecar() にはベース名を渡す
            let (mut rx, child) = app.shell().sidecar("cloudflared")?.args(&args).spawn()?;

            let child_arc = Arc::new(Mutex::new(Some(child))); // 先に Arc<Mutex> を作成

            // URL抽出ロジック (タイムアウト付き)
            let url_extraction = async {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            tracing::debug!("cloudflared stdout: {}", line); // ログ出力
                            if let Some(mat) = CF_URL_RE.find(&line) {
                                let url = mat.as_str().to_string();
                                tracing::info!("Cloudflare Tunnel URL found: {}", url);
                                return Ok(url); // URLが見つかったら返す
                            }
                        }
                        CommandEvent::Stderr(line) => {
                            tracing::debug!("cloudflared stderr: {}", line); // stderr もログ出力
                            // stderr からも URL を探す
                            if let Some(mat) = CF_URL_RE.find(&line) {
                                let url = mat.as_str().to_string();
                                tracing::info!("Cloudflare Tunnel URL found in stderr: {}", url);
                                return Ok(url);
                            }
                        }
                        CommandEvent::Error(e) => {
                             tracing::error!("cloudflared error: {}", e);
                             return Err(TunnelError::StdioError); // エラー発生
                        }
                        CommandEvent::Terminated(status) => {
                            tracing::warn!("cloudflared terminated unexpectedly: {:?}", status);
                            return Err(TunnelError::UrlNotFound); // 早期終了
                        }
                         _ => {} // Ignore other events like Running
                    }
                }
                 Err(TunnelError::UrlNotFound) // ループを抜けたらURLが見つからなかった
            };

             match tokio::time::timeout(STARTUP_TIMEOUT, url_extraction).await {
                 Ok(Ok(url)) => Ok(TunnelInfo { process: child_arc, url }), // 成功
                 Ok(Err(e)) => Err(e), // URL抽出中のエラー
                 Err(_) => { // タイムアウト
                     // タイムアウトした場合でもプロセスは起動している可能性があるので、killしておく
                     let mut child_guard = child_arc.lock().unwrap();
                     if let Some(mut child_to_kill) = child_guard.take() {
                         match child_to_kill.kill().await { // .await を追加 (Windows対応)
                             Ok(_) => tracing::warn!("Killed cloudflared process due to timeout."),
                             Err(e) => tracing::error!("Failed to kill timed out cloudflared process: {}", e),
                         };
                     }
                     Err(TunnelError::Timeout)
                 }
             }
        }
        ```
*   **検証:**
    *   `start_tunnel` を単体で呼び出し、`cloudflared` プロセスが起動し、stdout/stderr に `https://*.trycloudflare.com` のURLが出力され、それが正しく抽出されて `Ok(TunnelInfo)` で返ることを確認。
    *   **推奨:** 開発環境 (dev モード) で `start_tunnel` を実行した際に、Sidecar プロセスが意図せず循環起動しないか確認します (Tauri v2 で修正済みのはずだが念のため)。
    *   抽出されたURLにブラウザでアクセスできるか確認 (WebSocketサーバーが動作していれば疎通確認ページが表示されるはず)。
    *   `wss://<host>.trycloudflare.com/ws` 形式のURLで WebSocket 接続が可能か確認 (別途クライアントツールやフロントエンドが必要)。
    *   引数 `--loglevel debug` などを追加して詳細なログを確認。
    *   タイムアウトが発生した場合に `Err(TunnelError::Timeout)` が返り、プロセスが kill されることを確認。 (タイムアウト値 (現在 15 秒) はネットワーク環境に応じて調整を検討)
*   **コミット:** `[feat] tauri-plugin-shellを使用してcloudflared用のstart_tunnelを実装`

### **ステップ 6.6: `stop_tunnel` 実装更新 (`tunnel.rs`)**

*   **実施内容:**
    *   `tunnel.rs` の `stop_tunnel` 関数を修正します。`TunnelInfo` の `process` フィールド (`Arc<Mutex<Option<CommandChild>>>`) から `CommandChild` を取り出し、`.kill().await` を呼び出すロジックは v5.1 とほぼ同じです。`Option` から `take()` する点、Windows で `.await` が必須な点に注意します。
        ```rust
        // src/ws_server/tunnel.rs (stop_tunnel の実装例)
        pub async fn stop_tunnel(tunnel_info: &TunnelInfo) {
            let mut maybe_child = tunnel_info.process.lock().unwrap().take(); // take で Option<Child> を取得
            if let Some(mut child) = maybe_child {
                tracing::info!("Stopping cloudflared tunnel process...");
                match child.kill().await {
                    Ok(_) => tracing::info!("Cloudflared tunnel process stopped."),
                    Err(e) => tracing::error!("Failed to stop cloudflared tunnel process: {}", e),
                }
            } else {
                tracing::debug!("Tunnel process already taken or stopped.");
            }
        }
        ```
*   **検証:** `start_tunnel` で起動したプロセスが `stop_tunnel` で正常に終了することを確認 (プロセスリストやログで確認)。
*   **コミット:** `[feat] cloudflared用のstop_tunnelを実装`

### **ステップ 6.7: `server_manager.rs` 統合更新**

*   **実施内容:**
    *   `src/ws_server/server_manager.rs` を開きます。
    *   `run_servers` (または相当するサーバー起動関数) 内で、`tunnel::start_tunnel` を呼び出すように変更します。
        *   Loophole 用の `start_tunnel` 呼び出し箇所を `cloudflared` 用の呼び出しに置き換えます。
        *   `tokio::spawn` を使って非同期に実行し、結果 (`Result<TunnelInfo, TunnelError>`) を `AppState` の `tunnel_info` フィールドに保存します。
    *   `stop_server` (または `run_servers` 終了時のクリーンアップ処理) 内で、`AppState` から `tunnel_info` を取得し、`Some(Ok(info))` であれば `tunnel::stop_tunnel(&info)` を呼び出すように変更します。Loophole 用の `stop_tunnel` 呼び出し箇所を置き換えます。
*   **検証:**
    *   アプリ起動時に `start_tunnel` が呼び出され、成功/失敗の結果が `AppState` に保存されることをログで確認。
    *   アプリ終了時に `stop_tunnel` が呼び出され、`cloudflared` プロセスが終了することを確認。
    *   トンネル起動失敗時（例: `cloudflared` バイナリがない）でもアプリがクラッシュせず、エラーが適切に記録・処理されることを確認。
*   **コミット:** `[feat] cloudflaredトンネル制御をserver_managerに統合`

### **ステップ 6.8: フロントエンド連携 (`emit_server_status`) 更新**

*   **実施内容:**
    *   `src/types.rs` (または相当するファイル) の `ServerStatus` 構造体を更新します。
        *   Loophole 関連のフィールド (`loophole_http_url` など) を削除または Cloudflare 用にリネームします (例: `cloudflare_http_url`)。
        *   `ws_url` の生成ロジックで、Cloudflare の URL (`https://*.trycloudflare.com`) を基に `wss://*.trycloudflare.com/ws` を生成するようにします。
        ```rust
        // src/types.rs (ServerStatus 修正例)
        #[derive(Clone, serde::Serialize, Debug)] // Debug トレイト追加推奨
        pub struct ServerStatus {
            pub is_running: bool,
            pub ws_url: String, // 生成された WSS URL (wss://*.trycloudflare.com/ws)
            pub obs_url: String, // 変更なし
            pub global_ip_fetch_failed: bool, // 変更なし
            pub cgnat_detected: bool, // 変更なし
            pub cloudflare_http_url: Option<String>, // cloudflared が提供する HTTPS URL
            pub tunnel_status: String, // "Starting", "Running", "Error: <message>", "Stopped" など
        }
        ```
    *   `server_manager.rs` の `emit_server_status` (またはイベント発行箇所) を修正します。
        *   `AppState` から `tunnel_info` を読み出し、その結果 (`Ok(info)`, `Err(e)`, `None`) に応じて `ServerStatus` の `cloudflare_http_url` と `ws_url`、`tunnel_status` フィールドを設定します。
        *   `ws_url` は `cloudflare_http_url` が `Some(url)` の場合に、`https://` を `wss://` に、`http://` を `ws://` に置換して `/ws` を追加するように生成します。トンネル起動失敗時や停止時は空文字列などにします。
        *   `tunnel_status` は、`AppState` の状態を見て設定します（例: 起動中、`Ok(info)` なら "Running"、`Err(e)` ならエラーメッセージ、サーバー停止中なら "Stopped"）。
        ```rust
        // server_manager.rs (emit_server_status 内のロジック例)
        let tunnel_info_lock = state.tunnel_info.lock().unwrap(); // state は AppState のインスタンス
        let (cloudflare_http_url, tunnel_status) = match &*tunnel_info_lock {
             Some(Ok(info)) => (Some(info.url.clone()), "Running".to_string()),
             Some(Err(e)) => (None, format!("Error: {}", e)),
             None => (None, "Starting".to_string()), // またはサーバー起動前なら "Stopped"
        };
        let ws_url = cloudflare_http_url
             .as_ref()
             .map(|url| {
                 url.replace("https://", "wss://")
                    .replace("http://", "ws://") + "/ws"
             })
             .unwrap_or_default(); // 失敗時は空

        let server_status = ServerStatus {
             is_running: state.server_handle.lock().unwrap().is_some(), // サーバーが起動しているか
             ws_url,
             obs_url: format!("http://127.0.0.1:{}", obs_port), // OBS URL は固定
             global_ip_fetch_failed: *state.global_ip_fetch_failed.lock().unwrap(),
             cgnat_detected: *state.cgnat_detected.lock().unwrap(),
             cloudflare_http_url,
             tunnel_status,
        };
        app_handle.emit("server_status_updated", server_status.clone())?; // emit用にclone

        // トンネル停止時にもステータスを更新して空URLを通知する
        if !server_status.is_running && tunnel_info_lock.is_some() {
            // TODO: `stop_server` 関数 (またはサーバー停止処理) 内で tunnel_info を None にクリアした後、
            // `emit_server_status` を呼び出して、フロントエンドに is_running=false, ws_url="", cloudflare_http_url=None
            // の状態を確実に通知する。
        }
        ```
*   **検証:**
    *   フロントエンドで受信する `server_status_updated` イベントのペイロードを確認。
    *   トンネル起動成功/失敗、IP取得成功/失敗、CGNAT検出の各状態で、`wsUrl`, `cloudflareHttpUrl`, `tunnelStatus` などが期待通りに設定されているか確認。
    *   フロントエンド UI が受信した情報に基づいて正しく表示を更新するか確認。
*   **コミット:** `[feat] cloudflaredトンネル用にserver_statusイベント発行処理を更新`

### **ステップ 6.9: テストと検証**

*   **実施内容:**
    *   上記各ステップの検証に加え、統合的なテストを実施します。
    *   **必須確認:**
        *   アプリ起動後、`cloudflared` が起動し、UI に正しい `wss://*.trycloudflare.com/ws` URL が表示されること。
        *   表示された WSS URL を使用して、外部の WebSocket クライアント (例: `websocat`, Simple WebSocket Client 拡張機能, または `viewer` アプリ) から接続し、メッセージの送受信が正常に行えること。Cloudflare Tunnel はデフォルトで WebSocket をサポートしています。
        *   IP 取得失敗時、CGNAT 検出時に UI に警告が表示されること (v5.1 からの流用部分)。
        *   アプリ終了時に `cloudflared` プロセスが確実に停止すること。
    *   **追加確認:**
        *   環境変数 `CLOUDFLARED_EXTRA_ARGS` に `--loglevel debug` や `--protocol http2` を設定し、動作が変わること（ログが増える、速度が変わるなど）を確認。
        *   `cloudflared` が異常終了した場合などのエラーハンドリングが機能することを確認。
*   **コミット:** `[test] cloudflared統合とWebSocket接続性を検証`
*   **追加確認:**
    *   ユーザーのホームディレクトリなどに `.cloudflared/config.yaml` が存在する場合、Quick Tunnel が起動しない可能性があるため、その場合のログ出力や挙動を確認する。必要に応じて `--config ""` 引数を `CLOUDFLARED_EXTRA_ARGS` または `start_tunnel` 内で追加することを検討。

---

**7. 残課題・懸念事項**

*   **`cloudflared` の安定性:** Quick Tunnels は一時的な利用を想定しており、長時間の安定性については未知数です。ただし、アプリ再起動時に再生成されるため、大きな問題にはなりにくいと考えられます。名前付きトンネル (要 Cloudflare ログイン) への移行も将来的に検討可能です。
*   **エラーハンドリング:** `cloudflared` 起動失敗、URL 取得タイムアウト (必要なら延長/再試行検討)、実行時エラー (プロセス途中終了など)、バイナリが見つからない場合など、様々なエラーケースに対するハンドリングとユーザーへのフィードバック (ログ、UI通知) を丁寧に実装する必要があります。
*   **再起動戦略:** トンネルプロセスが予期せず終了した場合に、自動で再起動 (例: 1回だけ、指数バックオフ付きで) するロジックを `server_manager` に追加すると、より安定性が向上します (オプション)。
*   **ログレベル管理:** `CLOUDFLARED_LOG_LEVEL` 環境変数と Tauri アプリ自体のログレベル (`RUST_LOG` など) の管理方法を一元化 (例: `.env` ファイル利用) すると、利用者が設定しやすくなります (オプション)。
*   **`config.yaml` 競合:** 前述の通り、グローバルな `config.yaml` が Quick Tunnel を妨げる可能性があるため、`--config ""` 引数の利用を検討します。
*   **バイナリの配布:** 各ターゲットプラットフォームに対応する `{externalBin}-{target}` 形式の `cloudflared` バイナリを `binaries/` ディレクトリに正確に配置し、`tauri.conf.json` の `externalBin` にベース名 `"cloudflared"` を指定することが重要です。実行時のバイナリ解決は Tauri が行います。