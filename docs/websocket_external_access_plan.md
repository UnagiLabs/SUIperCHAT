# WebSocketサーバー外部アクセス対応 **実装計画 v5.1 (Tauri 2)**

> **変更点概要**  
> * Tauri v2 の公式プラグイン方式・Capability System に対応  
> * `allowlist` → `capabilities/*.json` へ移行  
> * HTTP は `tauri-plugin-http`、サイドカーは `tauri-plugin-shell` を使用  
> * Sidecar 実行は `app.shell().sidecar()` API へ更新

## 1. 目標
1.  `suiperchat_streamer_app` の WebSocket サーバーを `127.0.0.1` で待受け、Loophole 経由でのみ外部アクセスを可能にする。
2.  外部 IP を多段取得し、CGNAT / 二重 NAT を自動判定し、到達不可の可能性を UI へ警告。
3.  **Loophole CLI を Tauri アプリに同梱**し、WebSocket サーバー起動時に**常にトンネルを自動起動**する。
    *   生成された Loophole HTTPS URL (`https://*.loophole.cloud`) をフロントエンドに提供。クライアントは **`wss://<hostname>.loophole.cloud/ws`** で接続する。
    *   **重要:** Loophole 経由での WebSocket (WSS) 通信は公式にはサポートされておらず、動作保証はないため、実装時に十分な検証を行う。

---

## 2. 環境変数 (設定ファイルやUIからの変更も考慮)
| 変数名                  | 既定値                                                           | 説明                                                |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `WS_BIND_ADDR`          | `127.0.0.1`                                                      | WebSocket Listen アドレス (Loophole利用前提)        |
| `WS_PORT`               | `8082`                                                           | WebSocket Listen ポート                             |
| `OBS_PORT`              | `8081`                                                           | OBS 静的サーバー ポート                             |
| `EXTERNAL_IP_ENDPOINTS` | `https://api.ipify.org?format=json,https://ifconfig.me/all.json` | カンマ区切りで使用する外部IP取得API (JSON形式推奨)  |
| `LOOPHOLE_CLI_PATH`     | `loophole`                                                       | 同梱された Loophole CLI 実行ファイル名 (またはパス) |

---

## 3. ファイル変更
```
src-tauri/
 ├─ src/ws_server/
 │   ├─ server_manager.rs   ← 主要ロジック (IP取得, NAT判定, トンネル起動呼出)
 │   ├─ tunnel.rs           ← Loophole Sidecar 制御 (非同期 subprocess, URLパース)
 │   └─ ip_utils.rs         ← 外部IP取得ユーティリティ
 ├─ src/state.rs            ← アプリ状態管理
 ├─ Cargo.toml              ← 依存追加
 ├─ tauri.conf.json         ← externalBin設定
 ├─ capabilities/           ← Tauri 2 Capability 設定
 │   ├─ http.json           ← HTTP プラグイン用 Scope
 │   └─ shell.json          ← サイドカー実行 Scope
 ├─ binaries/               ← 各プラットフォーム用CLIバイナリ格納
 └─ build.rs / .github/workflows/*    ← CI 用モック & テスト
```

---

## 4. 依存ライブラリ (+features)
```toml
# 依存関係を追加する際は `cargo add <crate_name>` を使用することを推奨します。
[dependencies]
tauri              = { version = "2", default-features = false }  # Core
tauri-plugin-http  = "2"   # HTTP クライアント
tauri-plugin-shell = "2"   # サイドカー実行
actix-web          = { version = "4" } # rustls feature は不要
local-ip-address   = "0.6"
if-addrs           = "0.11" # ローカルIP複数取得用 (代替)
serde              = { version = "1", features = ["derive"] }
serde_json         = "1"
stun_client        = "0.4"         # CGNAT 判定
tracing            = "0.1"
tracing-subscriber = { version = "0.3", features = ["json", "env-filter"] } # JSONログ + Env Filter
tokio              = { version = "1", features = ["rt-multi-thread", "macros", "process"] } # process feature必須
regex              = "1" # トンネル出力パース用
once_cell          = "1" # static regex用

[build-dependencies]
# 必要であれば build.rs 用
```

---

## 5. アーキテクチャ (Mermaid)
```mermaid
graph TD
    subgraph BackEnd
        A[server_manager<br/>bind(WS_BIND_ADDR, WS_PORT)]
        A --> B{外部IP取得};
        B -->|成功| C[外部IP 保存];
        B -->|失敗| D[ローカルIP/127.0.0.1<br/>+failure_flag];
        C & D --> E[emit_server_status];
        E --> F[フロント];
    end

    subgraph NAT判定
        G[STUN Query] --> H{一致?};
        H -->|Mismatch| I[CGNAT=true → UI警告];
    end

    subgraph Loophole Tunneling
        J[tunnel.rs<br/>Spawn Loophole Sidecar] --> K[loophole http ${WS_PORT}];
        K --> L[Parse HTTPS URL from stdout<br/>(https://*.loophole.cloud)];
        L --> M[Save Tunnel Info];
        M -.-> F;
    end

    subgraph OBS
        N[obs_server<br/>bind(127.0.0.1, OBS_PORT)]
    end

    subgraph Tauri Config & Bundle
       O[tauri.conf.json] --> P[externalBin: loopholeバイナリ指定];
       O --> Q[plugins: http, shell];
       R[capabilities/*.json] -.-> Q;
    end
```

---

## 6. 実装ステップ

### 6-1. Loophole CLI ライセンス確認と準備 (macOS/Windows)
*   **具体的な実施内容:**
    *   Loopholeの公式サイト、GitHubリポジトリでMITライセンスであることを再確認する。
    *   ターゲットプラットフォーム ( `windows-x86_64`, `macos-aarch64`, `macos-x86_64` ) 用のLoophole CLI実行ファイルをダウンロードする。
    *   プロジェクト内の `src-tauri/binaries/` ディレクトリを作成し、各ターゲット用のバイナリを `loophole-$TARGET_TRIPLE` 命名規則で配置する。
    *   Loopholeリポジトリから `LICENSE` ファイルを取得し、`src-tauri/binaries/` に配置する。

*   **検証方法:**
    *   `cargo tauri build` 後、生成されたアプリケーションバンドル (例: `.app`, `.msi`) 内に、ターゲットプラットフォームに応じたLoopholeバイナリとLICENSEファイルが含まれていることを確認する (インストーラー展開、アーカイブ内容確認)。
    *   macOSではバンドルされたバイナリに実行権限が付与されているか確認する (必要なら `build.rs` で調整)。

*   **コミットメッセージ案:** `[feat] Loophole CLIバイナリとライセンスをバンドル (macOS/Windows)`

### 6-2. Tauri 設定 (`tauri.conf.json` & Capabilities)
*   **具体的な実施内容:**
    *   `tauri.conf.json` を開いて編集する：
        ```jsonc
        // tauri.conf.json
        {
          "build": { "beforeBuildCommand": "", "beforeDevCommand": "" },
          "package": { "productName": "SUIperChat", "version": "0.1.0" },
          "bundle": {
            "identifier": "com.example.suiperchat",
            "externalBin": ["binaries/loophole"]
          },
          "plugins": {
            "shell": {},
            "http": {}
          }
        }
        ```
    *   `capabilities/http.json` を作成する：
        ```jsonc
        // capabilities/http.json
        {
          "$schema": "../gen/schemas/desktop-schema.json",
          "identifier": "http-cap",
          "permissions": [
            {
              "identifier": "http:default",
              "allow": [
                { "url": "https://api.ipify.org/*" },
                { "url": "https://ifconfig.me/*" }
              ]
            }
          ]
        }
        ```
    *   `capabilities/shell.json` を作成する：
        ```jsonc
        // capabilities/shell.json
        {
          "$schema": "../gen/schemas/desktop-schema.json",
          "identifier": "shell-cap",
          "permissions": [
            {
              "identifier": "shell:allow-spawn",
              "allow": [
                { "name": "binaries/loophole", "sidecar": true }
              ]
            }
          ]
        }
        ```

*   **検証方法:**
    *   `cargo tauri build` がエラーなく成功すること。
    *   アプリケーション起動時、開発者コンソールに `tauri.conf.json` の読み込みエラーが出ていないこと。
    *   後のステップで、許可したHTTPリクエストが成功し、Sidecarプロセスがエラーなく起動することを確認する。
*   **コミットメッセージ案:** `[feat] Loopholeサイドカーとプラグイン設定用にTauri v2設定ファイルを構成`

### 6-3. IP 取得ユーティリティの実装
*   **具体的な実施内容:**
    *   `src/ws_server/ip_utils.rs` を作成：
        ```rust
        use tauri_plugin_http::reqwest; // re-exported reqwest
        use std::{net::IpAddr, str::FromStr};
        use tauri::AppHandle;

        pub async fn get_external_ip(app: &AppHandle) -> Result<IpAddr, String> {
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .map_err(|e| e.to_string())?;

            let endpoints = std::env::var("EXTERNAL_IP_ENDPOINTS")
                .unwrap_or_else(|_| "https://api.ipify.org?format=json,https://ifconfig.me/all.json".into());
            for url in endpoints.split(',') {
                match client.get(url).send().await {
                    Ok(r) => {
                        let v: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
                        if let Some(ip_str) = v.get("ip").and_then(|v| v.as_str()) {
                            if let Ok(ip) = IpAddr::from_str(ip_str) {
                                return Ok(ip);
                            }
                        }
                    }
                    Err(_) => continue,
                }
            }
            Err("Failed to fetch external IP".into())
        }
        ```
    *   `AppState` (`src/state.rs`) に `external_ip: Arc<Mutex<Option<IpAddr>>>`, `global_ip_fetch_failed: Arc<Mutex<bool>>` を追加。 (既存の `Option<String>` から変更の可能性あり)
    *   外部IP取得、CGNAT判定などのロジックを新しいAPIに合わせて実装する。

*   **検証方法:**
    *   `ip_utils.rs` の単体テスト:
        *   HTTP Client をモックとして用意し、正常系と異常系をテスト。
        *   正常系(複数API試行)、APIエラー、タイムアウト、JSONパースエラー、IPアドレス形式エラーをテスト。
    *   実機テスト (部分):
        *   `get_external_ip` を単体で呼び出し、グローバルIPが正しく取得できることを確認。
        *   意図的に `EXTERNAL_IP_ENDPOINTS` に無効なURLを設定し、`Err` が返ることを確認。
*   **コミットメッセージ案:** `[feat] 外部IP取得ユーティリティをTauri v2対応に実装`

### 6-4. CGNAT 判定の実装と統合
*   **具体的な実施内容:**
    *   `AppState` (`src/state.rs`) に `cgnat_detected: Arc<Mutex<bool>>` を追加。
    *   `ip_utils.rs` に `check_cgnat(public_ip: IpAddr) -> Result<bool, String>` 関数を実装:
        *   `stun_client::query_any("stun.l.google.com:19302").await` (または他のSTUNサーバー) を呼び出す。 (`stun_client` クレートが必要)
        *   成功した場合、返された Mapped Address (`SocketAddr`) の `ip()` と引数の `public_ip` を比較。
        *   一致しなければ `Ok(true)` (CGNAT検出)、一致すれば `Ok(false)` を返す。
        *   STUNクエリ失敗時は `Err("STUN query failed.".to_string())` を返す。エラーログも記録。
    *   `server_manager.rs` の `run_servers` 開始時に `tokio::spawn` を使って以下の処理を非同期に実行:
        *   `get_external_ip` を呼び出す。
        *   成功した場合、取得したIPを `AppState` の `external_ip` に保存し、そのIPを使って `check_cgnat` を呼び出す。
        *   `check_cgnat` の結果 (`Ok(is_cgnat)` または `Err`) を `AppState` の `cgnat_detected` に保存する (`Ok(true)` or `Err` の場合は `true`、`Ok(false)` の場合は `false`)。
        *   `get_external_ip` が失敗した場合、`AppState` の `global_ip_fetch_failed` を `true` に設定し、`cgnat_detected` も `true` (不明瞭なため警告を出す方向で) に設定する。
*   **検証方法:**
    *   `ip_utils.rs` の単体テスト:
        *   `check_cgnat`: STUNサーバー応答をモックするか、既知の結果になるIPでテスト。
    *   実機テスト (統合):
        *   通常のネットワークで起動し、`AppState` に `external_ip` が保存され、`cgnat_detected` が `false` であることをログで確認。
        *   可能であれば、VPNやモバイルテザリング等でネットワーク環境を変え、IPアドレスの変化やCGNAT検出 (`true`) を確認。
        *   外部IP取得に失敗した場合 (`global_ip_fetch_failed` が `true`) に、`cgnat_detected` も `true` になることを確認。
*   **コミットメッセージ案:** `[feat] CGNAT判定機能を追加し、IP取得と統合`

### 6-5. Tunnel 構造体とエラー定義 (`tunnel.rs`)
*   **具体的な実施内容:**
    *   `src/ws_server/tunnel.rs` を作成。
    *   `struct TunnelInfo { process: Arc<Mutex<Child>>, url: String }` を定義 (`Arc<Mutex<>>` でプロセスハンドルを共有可能に)。
    *   `TunnelError` enum を定義 (例: `SpawnFailed`, `StdioError`, `UrlNotFound`, `Timeout`)。
*   **検証方法:**
    *   (特になし、後続ステップで利用される)
*   **コミットメッセージ案:** `[refactor] Loophole Tunnel関連の構造体とエラー型を定義`

### 6-6. Tunnel 起動処理の実装 (`start_tunnel`)
*   **具体的な実施内容:**
    *   `tunnel.rs` に `start_tunnel(app_handle: &AppHandle, ws_port: u16) -> Result<TunnelInfo, TunnelError>` 関数を実装:
        ```rust
        use tauri_plugin_shell::ShellExt;
        use tauri_plugin_shell::process::{CommandEvent, CommandChild};
        use tauri::{AppHandle, Manager};
        use tokio::sync::mpsc;

        pub async fn start_tunnel(app: &AppHandle, ws_port: u16) -> Result<String, TunnelError> {
            let (mut rx, mut child): (mpsc::UnboundedReceiver<CommandEvent>, CommandChild) =
                app.shell()
                    .sidecar("binaries/loophole")?      // filename only
                    .args(["http", &ws_port.to_string()])
                    .spawn()
                    .map_err(|_| TunnelError::SpawnFailed)?;

            // …stdout 監視して https://*.loophole.cloud を抽出…
        }
        ```
        *   stdout を非同期に読み取るタスクを実装:
            *   受信したイベントから標準出力を取得し、一行ずつ処理。
            *   `Regex::new(r"https://[a-zA-Z0-9-]+\.loophole\.cloud").unwrap()` (`regex`, `once_cell` クレートが必要) でURLを検索。
            *   見つかったらURLをチャネル (`tokio::sync::mpsc`) などで送り返す。
            *   タイムアウト処理 (例: `tokio::time::timeout`) を追加。
        *   チャネルからURLを受信するかタイムアウトしたら結果を返す (`Ok(TunnelInfo{...})` or `Err(TunnelError::Timeout)` / `UrlNotFound`)。
*   **検証方法:**
    *   単体テスト: 正規表現のURL抽出ロジックをテスト。
    *   ローカル実行テスト (部分):
        *   `start_tunnel` を呼び出し、Loopholeプロセスがバックグラウンドで起動することを確認 (プロセスリスト確認)。
        *   標準出力のログからHTTPS URLが正しく抽出され、`TunnelInfo` として返されることを確認。
        *   返されたHTTPS URLにブラウザでアクセスし、ローカルのWebSocketサーバー (ポート `ws_port`) に接続できるか確認 (HTTP Upgradeが通るか)。
        *   **重要:** WebSocketクライアントで `wss://<hostname>.loophole.cloud/ws` (抽出したURLから生成) に接続し、メッセージ送受信が安定するかテスト。
        *   `start_tunnel` がタイムアウトした場合に `Err` が返ることをテスト (意図的にURLを出力しないプロセスを使うなど)。
*   **コミットメッセージ案:** `[feat] Loopholeトンネル起動処理をTauri v2 Shell対応に実装`

### 6-7. Tunnel 停止処理の実装 (`stop_tunnel`)
*   **具体的な実施内容:**
    *   `tunnel.rs` に `stop_tunnel(tunnel_info: &TunnelInfo)` 関数を実装:
        *   `tunnel_info.process.lock().unwrap().kill().await` でプロセスを停止 (`tokio::process::ChildExt`)。エラーをログ記録 (`tracing`)。
*   **検証方法:**
    *   ローカル実行テスト (部分):
        *   `start_tunnel` で起動したプロセスを持つ `TunnelInfo` を用意する。
        *   `stop_tunnel` を呼び出し、Loopholeプロセスが終了することを確認 (プロセスリスト確認)。
*   **コミットメッセージ案:** `[feat] Loopholeトンネル停止処理を実装 (stop_tunnel)`

### 6-8. `server_manager.rs` 統合
*   **具体的な実施内容:**
    *   `AppState` に `loophole_info: Arc<Mutex<Option<Result<TunnelInfo, TunnelError>>>>` を追加。
    *   `run_servers` 関数内で、**常に**トンネル起動処理を行う。
        *   `tokio::spawn` で `tunnel::start_tunnel` を呼び出し、その結果 (`Result`) を `AppState` の `loophole_info` に書き込む。
        *   `start_tunnel` の呼び出し前に、フロントエンドに「トンネル起動中...」のような一時的なステータスを通知するイベントを発行することも検討。
    *   `stop_server` (または `run_servers` 終了時のクリーンアップ処理):
        *   `AppState` の `loophole_info` を `lock()` して `take()` し、`Some(Ok(info))` であれば `tunnel::stop_tunnel(&info)` を呼び出す。
*   **検証方法:**
    *   アプリ起動/停止ログを確認し、トンネルの起動・停止処理が**常に**呼び出されていること、`AppState` に結果が保存されていることを確認。
    *   トンネル起動が成功した場合と失敗した場合（例: Loophole CLIが見つからない）の両方で、アプリがクラッシュせず、適切なログが出力されることを確認。
    *   IP取得、CGNAT判定、トンネル起動が並行して実行されても問題ないか確認。
*   **コミットメッセージ案:** `[feat] Loopholeトンネル制御をサーバーマネージャーに必須機能として統合`

### 6-9. フロントエンド連携 (`emit_server_status`)
*   **具体的な実施内容:**
    *   `src/types.rs` (または相当するファイル) に `ServerStatus` struct を定義し、`Serialize` と `Clone` を derive する。フィールドは TypeScript 側の定義に合わせる。
        ```rust
        #[derive(Clone, serde::Serialize)]
        pub struct ServerStatus {
            pub is_running: bool,
            pub ws_url: String, // LoopholeのWSS URL
            pub obs_url: String,
            pub global_ip_fetch_failed: bool,
            pub cgnat_detected: bool,
            pub loophole_http_url: Option<String>, // LoopholeのHTTPS URL
        }
        ```
    *   `server_manager.rs` に `emit_server_status` 関数を作成 (または既存のイベント発行箇所を修正)。
    *   この関数内で `AppState` の各フィールド (`external_ip`, `global_ip_fetch_failed`, `cgnat_detected`, `loophole_info` など) を `lock()` して読み出す。
    *   読み出した情報に基づいて `ServerStatus` の各フィールドを計算し、インスタンスを生成する。
        *   `let loophole_info_result = state.loophole_info.lock().unwrap();`
        *   `let loophole_http_url = loophole_info_result.as_ref().and_then(|res| res.as_ref().ok()).map(|info| info.url.clone());`
        *   `let ws_url = loophole_http_url.as_ref().map(|url| url.replace("https://", "wss://") + "/ws").unwrap_or_else(|| "".to_string()); // 失敗時は空文字`
    *   `app_handle.emit("server_status_updated", server_status_payload)?` でイベントを発行する。
    *   フロントエンド (TypeScript) 側で `listen<ServerStatus>('server_status_updated', ...)` を使用してイベントを購読し、受け取ったペイロードに基づいてUI表示を更新する。
*   **検証方法:**
    *   ブラウザの開発者ツールや Tauri DevTools を使用し、バックエンドから送信される `server_status_updated` イベントのペイロード内容を監視する。
    *   トンネル起動成功/失敗、IP取得成功/失敗、CGNAT検出あり/なし の各シナリオで、ペイロードの各フィールド (`wsUrl`, `loopholeHttpUrl`, `globalIpFetchFailed`, `cgnatDetected` など) が期待通りに設定されていることを確認する。
    *   フロントエンドのUIが、受け取った `ServerStatus` に応じて表示するURL (`wsUrl`) や警告メッセージを正しく切り替えることを確認する。
*   **コミットメッセージ案:** `[feat] ServerStatusイベントペイロードをLoophole必須化に合わせて更新`

---

## 7. セキュリティ & レート制限
*   Tauri v2 のCapability Systemによって、HTTP/Shellへのアクセスが最小権限で強制される
*   `tracing` の設定を `env-filter` を使って柔軟に行えるようにする。

---

## 8. テスト計画
| 種類        | 内容                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------- |
| Unit        | IP取得, URLパース, ServerStatus生成                                                                |
| Integration | GitHub ActionsでトンネルなしWSエコーテスト                                                         |
| E2E         | **ローカル環境で Loophole 経由の WSS 接続と通信安定性を重点的にテスト**。OBSプラグイン接続テスト。 |
| Network     | STUN CGNAT判定 → フラグ検証                                                                        |

---

## 9. 今後の展開メモ
*   変更なし (v2.0 計画の通り)。