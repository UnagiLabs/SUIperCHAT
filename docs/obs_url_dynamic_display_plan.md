# OBS用URL動的表示 改善計画

## 問題点

-   OBS用ブラウザソースのURL (`http://127.0.0.1:8082/obs/`) が真っ白なページになる。
    -   原因1: OBS用HTTPサーバーはポート `8081` で起動する設計になっているため、アクセスするポートが異なる。
    -   原因2: サーバー自体が起動していない可能性がある。
-   TauriアプリのUI (`ServerControl.tsx`) で表示されるサーバーアドレスがハードコードされている。

## 改善目標

1.  OBS用URL (`http://127.0.0.1:8081/obs/`) が正しく表示されるようにする（サーバー起動が前提）。
2.  TauriアプリのUIに、実際にサーバーがリッスンしている動的なOBS用URLとWebSocket用URLを表示する。

## 計画概要

1.  **バックエンド (`server.rs`) の修正:**
    *   `start_websocket_server` コマンド内で、Actix Web サーバーが実際にリッスンを開始したアドレスとポート番号を取得する。
    *   取得した情報から、完全な OBS 用 URL (`http://<ip>:<port>/obs/`) と WebSocket URL (`ws://<ip>:<port>/ws`) を生成する。
    *   サーバー起動成功時にフロントエンドへ送信する `server_status_updated` イベントのペイロードを更新し、生成したURLを含める (例: `{ is_running: true, obs_url: "...", ws_url: "..." }`)。停止時も同様に `null` を含める。
2.  **フロントエンド (`ServerControl.tsx`) の修正:**
    *   `server_status_updated` イベントのリスナー (`handle_server_status_event`) で、イベントペイロードから動的に取得した OBS 用 URL と WebSocket URL を受け取る。
    *   受け取った URL をコンポーネントの State (`obs_server_address`, `ws_server_address`) に設定し、UI表示を更新する。

## 計画詳細 (シーケンス図)

```mermaid
sequenceDiagram
    participant FE as Frontend (ServerControl.tsx)
    participant BE as Backend (server.rs)
    participant Actix as Actix Web Server

    Note over FE, BE: User clicks "Start Server" button
    FE->>BE: invoke("start_websocket_server")
    BE->>Actix: HttpServer::new().bind((host, obs_port)) // Bind OBS Server
    Actix-->>BE: Ok(bound_obs_server)
    Note right of BE: Get actual OBS address (e.g., bound_obs_server.addrs()) -> obs_addr
    BE->>Actix: HttpServer::new().bind((host, ws_port)) // Bind WS Server
    Actix-->>BE: Ok(bound_ws_server)
    Note right of BE: Get actual WS address (e.g., bound_ws_server.addrs()) -> ws_addr
    Note right of BE: Generate obs_url = "http://{obs_addr}/obs/"
    Note right of BE: Generate ws_url = "ws://{ws_addr}/ws"
    BE-->>FE: emit("server_status_updated", { is_running: true, obs_url: generated_obs_url, ws_url: generated_ws_url })
    FE->>FE: handle_server_status_event(payload)
    FE->>FE: set_is_server_running(true)
    FE->>FE: set_obs_server_address(payload.obs_url)
    FE->>FE: set_ws_server_address(payload.ws_url)
    Note right of FE: UI updates to show dynamic URLs

    Note over FE, BE: User clicks "Stop Server" button
    FE->>BE: invoke("stop_websocket_server")
    BE->>Actix: server_handle.stop(true).await // Stop both servers
    BE-->>FE: emit("server_status_updated", { is_running: false, obs_url: null, ws_url: null })
    FE->>FE: handle_server_status_event(payload)
    FE->>FE: set_is_server_running(false)
    FE->>FE: set_obs_server_address(null)
    FE->>FE: set_ws_server_address(null)
    Note right of FE: UI updates to clear URLs
```

## 次のステップ

1.  この計画ファイルを保存する。
2.  `code` モードに切り替えて、バックエンド (`server.rs`) の修正を開始する。
3.  フロントエンド (`ServerControl.tsx`) の修正を行う。
4.  動作確認を行う。