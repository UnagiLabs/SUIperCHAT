# WebSocketサーバー外部アクセス対応 **実装計画 v5.0**

## 1. 目標
1.  `suiperchat_streamer_app` の WebSocket サーバーを `127.0.0.1` で待受け、Loophole 経由でのみ外部アクセスを可能にする。
2.  外部 IP を多段取得し、CGNAT / 二重 NAT を自動判定し、到達不可の可能性を UI へ警告。
3.  **Loophole CLI を Tauri アプリに同梱**し、WebSocket サーバー起動時に**常にトンネルを自動起動**する。
    *   生成された Loophole HTTPS URL (`https://*.loophole.cloud`) をフロントエンドに提供。クライアントは **`wss://<hostname>.loophole.cloud/ws`** で接続する。
    *   **重要:** Loophole 経由での WebSocket (WSS) 通信は公式にはサポートされておらず、動作保証はないため、実装時に十分な検証を行う。

---

## 2. 環境変数 (設定ファイルやUIからの変更も考慮)
| 変数名 | 既定値 | 説明 |
| --- | --- | --- |
| `WS_BIND_ADDR` | `127.0.0.1` | WebSocket Listen アドレス (Loophole利用前提) |
| `WS_PORT`      | `8082`    | WebSocket Listen ポート |
| `OBS_PORT`     | `8081`    | OBS 静的サーバー ポート |
| `EXTERNAL_IP_ENDPOINTS` | `https://api.ipify.org?format=json,https://ifconfig.me/all.json` | カンマ区切りで使用する外部IP取得API (JSON形式推奨) |
| `LOOPHOLE_CLI_PATH` | `loophole` | 同梱された Loophole CLI 実行ファイル名 (またはパス) |

---

## 3. ファイル変更
```
src-tauri/
 ├─ src/ws_server/server_manager.rs   ← 主要ロジック (IP取得, NAT判定, トンネル起動呼出)
 ├─ src/ws_server/tunnel.rs           ← Loophole Sidecar 制御 (非同期 subprocess, URLパース)
 ├─ Cargo.toml                        ← 依存追加
 ├─ tauri.conf.json                   ← externalBin設定, HTTP/Shell Allowlist 更新
 └─ (必要であれば) loophole/          ← 各プラットフォーム用CLIバイナリ格納
 └─ build.rs / .github/workflows/*    ← CI 用モック & テスト
```

---

## 4. 依存ライブラリ (+features)
```toml
[dependencies]
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

# Tauri 側も確認
# tauri = { version = "...", features = ["http-api", "shell-sidecar", "native-tls-vendored"] }
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
       O --> Q[allowlist: http, shell.sidecar];
       R[App Bundle] -.-> P;
    end
```

---

## 6. 実装ステップ

### 6-1. Loophole CLI ライセンス確認と準備
*   **具体的な実施内容:**
    *   Loopholeの公式サイト、GitHubリポジトリでMITライセンスであることを再確認する。
    *   ターゲットプラットフォーム (例: `windows-x86_64`, `macos-aarch64`, `macos-x86_64`, `linux-x86_64`) 用のLoophole CLI実行ファイルをダウンロードする。
    *   プロジェクト内の `src-tauri/binaries/` ディレクトリを作成し、プラットフォーム名を付けたサブディレクトリ (例: `macos-aarch64`) を作成し、対応するバイナリを配置する (例: `src-tauri/binaries/macos-aarch64/loophole`)。
    *   Loopholeリポジトリから `LICENSE` ファイルを取得し、`src-tauri/binaries/` に配置する。
*   **検証方法:**
    *   `cargo tauri build` 後、生成されたアプリケーションバンドル (例: `.app`, `.msi`, `.deb`) 内に、ターゲットプラットフォームに応じたLoopholeバイナリとLICENSEファイルが含まれていることを確認する (インストーラー展開、アーカイブ内容確認)。
    *   macOS/Linuxではバンドルされたバイナリに実行権限が付与されているか確認する (必要なら `build.rs` で調整)。
*   **コミットメッセージ案:** `[機能] Loophole CLIバイナリとライセンスをバンドル`

### 6-2. Tauri 設定 (`tauri.conf.json`)
*   **具体的な実施内容:**
    *   `tauri.conf.json` を開いて編集する。
    *   `"tauri"."bundle"."externalBin"` 配列に、各ターゲットプラットフォーム用のLoophole CLIバイナリへのパスを追加する。例: `["binaries/$TARGET/loophole"]` (Tauriが `$TARGET` を置換してくれる)。
    *   `"tauri"."allowlist"."http"."scope"` 配列に、`EXTERNAL_IP_ENDPOINTS` で使用するAPIのオリジンを追加する。例: `"https://api.ipify.org/*"`, `"https://ifconfig.me/*"`。
    *   `"tauri"."allowlist"."shell"."sidecar"` を `true` に設定する。
*   **検証方法:**
    *   `cargo tauri build` がエラーなく成功すること。
    *   アプリケーション起動時、開発者コンソールに `tauri.conf.json` の読み込みエラーが出ていないこと。
    *   後のステップで、許可したHTTPリクエストが成功し、Sidecarプロセスがエラーなく起動することを確認する。
*   **コミットメッセージ案:** `[機能] LoopholeサイドカーとHTTP許可リスト用にTauriを設定`

### 6-3. IP 取得ユーティリティ & CGNAT 判定
*   **具体的な実施内容:**
    *   `src/ws_server/ip_utils.rs` を作成。
    *   `AppState` (`src/state.rs`) に `external_ip: Arc<Mutex<Option<IpAddr>>>`, `global_ip_fetch_failed: Arc<Mutex<bool>>`, `cgnat_detected: Arc<Mutex<bool>>` を追加。
    *   `ip_utils.rs` に `get_external_ip(app_handle: &AppHandle) -> Result<IpAddr, String>` 関数を実装:
        *   Tauri HTTP Client (`tauri::http::ClientBuilder::new().build()?`) を使用。
        *   環境変数 `EXTERNAL_IP_ENDPOINTS` を読み込み、カンマで分割してURLリストを取得。デフォルト値も定義。
        *   URLリストをループし、各URLに `client.get(url).send().await?` でリクエスト。タイムアウト (`timeout()`) を設定。
        *   成功したらレスポンスボディ (`response.body().await?`) をJSONパース (`serde_json::from_slice`) し、`"ip"` フィールド等を取得。
        *   `IpAddr::from_str` で `IpAddr` に変換。
        *   最初に成功したIPアドレスを `Ok(ip)` で返す。
        *   ループが完了しても成功しなかった場合は `Err("Failed to fetch external IP from all sources.".to_string())` を返す。
        *   エラー発生時は `tracing::error!` でログ記録。
    *   `ip_utils.rs` に `check_cgnat(public_ip: IpAddr) -> Result<bool, String>` 関数を実装:
        *   `stun_client::query_any("stun.l.google.com:19302").await` (または他のSTUNサーバー) を呼び出す。
        *   成功した場合、返された Mapped Address (`SocketAddr`) の `ip()` と引数の `public_ip` を比較。
        *   一致しなければ `Ok(true)` (CGNAT検出)、一致すれば `Ok(false)` を返す。
        *   STUNクエリ失敗時は `Err("STUN query failed.".to_string())` を返す。エラーログも記録。
    *   `server_manager.rs` の `run_servers` 開始時に `get_external_ip` と `check_cgnat` を `tokio::spawn` で非同期に呼び出し、結果を `AppState` の対応するフィールドに `lock()` して書き込む。IP取得失敗時は `global_ip_fetch_failed` を `true` にする。
*   **検証方法:**
    *   `ip_utils.rs` の単体テスト:
        *   Tauri HTTP Client をモック化 (難しい場合、テスト用HTTPサーバーを立てる)。
        *   正常系(複数API試行)、APIエラー、タイムアウト、JSONパースエラー、IPアドレス形式エラーをテスト。
        *   `check_cgnat`: STUNサーバー応答をモックするか、既知の結果になるIPでテスト。
    *   実機テスト:
        *   通常のネットワークで起動し、グローバルIPが正しく取得され `AppState` に保存されることをログで確認。`cgnat_detected` が `false` であること。
        *   可能であれば、VPNやモバイルテザリング等でネットワーク環境を変え、IPアドレスの変化やCGNAT検出 (検出されれば `true`) を確認。
        *   意図的に `EXTERNAL_IP_ENDPOINTS` に無効なURLを設定し、フォールバック (ローカルIP等) が機能し、`global_ip_fetch_failed` が `true` になることを確認。
*   **コミットメッセージ案:** `[機能] 外部IP取得とCGNAT判定ユーティリティを実装`

### 6-4. トンネル制御 (`tunnel.rs`)
*   **具体的な実施内容:**
    *   `src/ws_server/tunnel.rs` を作成。
    *   `struct TunnelInfo { process: Arc<Mutex<Child>>, url: String }` を定義 (`Arc<Mutex<>>` でプロセスハンドルを共有可能に)。
    *   `TunnelError` enum を定義 (例: `SpawnFailed`, `StdioError`, `UrlNotFound`, `Timeout`)。
    *   `start_tunnel(app_handle: &AppHandle, ws_port: u16) -> Result<TunnelInfo, TunnelError>` 関数を実装:
        *   `LOOPHOLE_CLI_PATH` 環境変数から実行ファイル名を取得 (デフォルト: `"loophole"`)。
        *   `Command::new_sidecar(cli_name)?.args(["http", &ws_port.to_string()]).stdout(Stdio::piped()).spawn()?` でプロセス起動。`Child` を取得。
        *   `Arc::new(Mutex::new(child))` でラップ。
        *   stdout を非同期に読み取るタスクを `tokio::spawn` で起動:
            *   `BufReader::new(child_stdout).lines()` で一行ずつ読む。
            *   `Regex::new(r"https://[a-zA-Z0-9-]+\.loophole\.cloud").unwrap()` (once_cell使用推奨) でURLを検索。
            *   見つかったらURLをチャネル (`tokio::sync::mpsc`) などで `start_tunnel` 関数に送り返す。
            *   タイムアウト処理 (例: `tokio::time::timeout`) を追加。
        *   チャネルからURLを受信するかタイムアウトしたら結果を返す (`Ok(TunnelInfo{...})` or `Err(TunnelError::Timeout)` / `UrlNotFound`)。
    *   `stop_tunnel(tunnel_info: &TunnelInfo)` 関数を実装:
        *   `tunnel_info.process.lock().unwrap().kill().await` でプロセスを停止。エラーをログ記録。
*   **検証方法:**
    *   単体テスト: 正規表現のURL抽出ロジックをテスト。
    *   ローカル実行テスト:
        *   `start_tunnel` を呼び出し、Loopholeプロセスがバックグラウンドで起動することを確認 (プロセスリスト確認)。
        *   標準出力のログからHTTPS URLが正しく抽出され、`TunnelInfo` として返されることを確認。
        *   返されたHTTPS URLにブラウザでアクセスし、ローカルのWebSocketサーバー (ポート `ws_port`) に接続できるか確認 (HTTP Upgradeが通るか)。
        *   **最重要:** WebSocketクライアントで `wss://<hostname>.loophole.cloud/ws` (抽出したURLから生成) に接続し、メッセージ送受信が安定するかテスト。
        *   `stop_tunnel` を呼び出し、Loopholeプロセスが終了することを確認。
        *   `start_tunnel` がタイムアウトした場合に `Err` が返ることをテスト (意図的にURLを出力しないプロセスを使うなど)。
*   **コミットメッセージ案:** `[機能] サイドカープロセス経由でのLoopholeトンネル制御を実装`

### 6-5. `server_manager.rs` 統合
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
*   **コミットメッセージ案:** `[機能] Loopholeトンネル制御をサーバーマネージャーに必須機能として統合`

### 6-6. フロントエンド連携 (`emit_server_status`)
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
*   **コミットメッセージ案:** `[機能] ServerStatusイベントペイロードをLoophole必須化に合わせて更新`

---

## 7. セキュリティ & レート制限
*   変更なし (v2.0 計画の通り)。`tracing` の設定を `env-filter` を使って柔軟に行えるようにする。

---

## 8. テスト計画
| 種類 | 内容 |
| --- | --- |
| Unit | IP取得, URLパース, ServerStatus生成 |
| Integration | GitHub ActionsでトンネルなしWSエコーテスト |
| E2E | **ローカル環境で Loophole 経由の WSS 接続と通信安定性を重点的にテスト**。OBSプラグイン接続テスト。 |
| Network | STUN CGNAT判定 → フラグ検証 |

---

## 9. 今後の展開メモ
*   変更なし (v2.0 計画の通り)。

---