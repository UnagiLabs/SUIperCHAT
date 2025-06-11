# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

SUIperCHAT is a blockchain-powered SuperChat system built on the SUI network, consisting of three main components:

1. **Viewer Frontend** (`viewer/`): Next.js web app for viewers to send SUI-based donations
2. **Streamer Desktop App** (`suiperchat_streamer_app/`): Tauri-based desktop application for streamers to manage and display donations
3. **Smart Contract** (`contract/`): Move language smart contract on SUI blockchain handling payment logic

### Data Flow
- Viewers connect via HTTPS to the viewer frontend
- Donations are processed through SUI blockchain smart contracts
- Real-time updates flow through WebSocket connections to the streamer app
- OBS integration displays donations as browser source overlays

## Development Commands

### Root Level
The project uses separate package.json files for each component. Navigate to the specific directory first.

### Viewer Frontend (viewer/)
```bash
npm run dev       # Development server with Turbopack
npm run build     # Production build
npm run start     # Production server
npm run check     # Biome formatter and linter
```

### Streamer App (suiperchat_streamer_app/)
```bash
npm run dev           # Next.js frontend only
npm run tauri dev     # Full Tauri development with hot reload
npm run build         # Next.js production build
npm run tauri build   # Complete desktop app with installers
npm run check         # Biome formatter and linter
```

### Smart Contract (contract/suiperchat/)
```bash
sui move build    # Compile Move contract
sui move test     # Run Move tests
```

## Technology Stack

### Frontend Technologies
- **Framework**: Next.js 15 with React 19 and TypeScript
- **UI**: shadcn/ui components with Radix UI primitives and Tailwind CSS
- **Blockchain**: SUI TypeScript SDK (@mysten/dapp-kit) for wallet integration
- **Code Quality**: Biome for formatting and linting (tab indentation, double quotes)

### Streamer App Backend
- **Framework**: Tauri 2.x (Rust + WebView hybrid)
- **Web Server**: Actix Web for WebSocket and HTTP endpoints
- **Database**: SQLite with SQLx for session and message storage
- **Async Runtime**: Tokio for concurrent operations
- **State Management**: Tauri's built-in state management system

### Blockchain Layer
- **Language**: Move for SUI blockchain smart contracts
- **Testing**: Built-in Move testing framework

## Key Architectural Patterns

### Tauri Hybrid Architecture
The streamer app uses Tauri's pattern of Rust backend with web frontend:
- Rust handles system operations, WebSocket server, and database
- Next.js frontend provides UI through Tauri's WebView
- Communication via Tauri commands (`invoke()`) and events

### WebSocket Communication
- Streamer app runs local WebSocket server for real-time messaging
- Viewers connect to receive live updates
- OBS browser sources connect for overlay display
- Session-based message management with SQLite persistence

### SUI Blockchain Integration
- Smart contracts handle payment logic and validation
- TypeScript SDK manages wallet connections and transactions
- Real-time transaction monitoring for instant donation updates

## Development Environment Setup

### Prerequisites
- Node.js and npm
- Rust toolchain (for streamer app)
- SUI CLI (for smart contract development)

### Database
- Development uses `dev.db` SQLite file in streamer app root
- Production uses platform-specific app data directories
- Database schema managed in Rust code (`database.rs`, `db_models.rs`)

### Code Quality Standards
- Consistent Biome configuration across frontend projects
- Tab indentation and double quotes enforced
- Recommended linting rules enabled
- Use `npm run check` before committing changes

## Testing Strategy

### Frontend Testing
- Standard React testing patterns for UI components
- Integration testing for SUI wallet interactions

### Backend Testing  
- Rust unit tests with `cargo test`
- WebSocket integration testing in development mode

### Smart Contract Testing
- Move testing framework with `sui move test`
- Test files in `contract/suiperchat/tests/`

Always test in both development and production modes as they use different configurations and database locations.

## Commit Message Guidelines

### タイトルのフォーマット
[type] タイトル

### Type の種類
- feat: 新機能
- fix: バグ修正
- docs: ドキュメントのみの変更
- refactor: リファクタリング
- test: テストコードの追加・修正
- other: その他の変更

### タイトルのルール
- 全体で50文字以内
- 末尾にピリオドを付けない
- 現在形で記述

### Breaking Changes
重要な変更の場合は、タイトルの末尾に "!"を付加
例: [feat]! 認証方式の変更

### 詳細内容
箇条書きで変更内容を記載
```
- `対象ファイル`
    - 変更内容1
    - 変更内容2
```

例:
```
[feat] 認証方式の変更
- `src/validator.rs`
    - 入力値の検証ルールを強化  
    - パフォーマンス改善のためキャッシュを導入
- `src/main.rs`
    - 認証方式を変更
    - 認証ロジックを変更
```

## Pull Request Guidelines

### タイトル
[type] 具体的な変更内容を要約したタイトル

**`[type]` は以下から選択してください:**
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメントのみの変更
- `refactor`: リファクタリング（機能変更を伴わないコード改善）
- `test`: テストコードの追加・修正
- `other`: 上記いずれにも当てはまらない変更

### 概要
今回の変更の目的や背景、解決する課題などを `<diff_main.txtの内容>` を基に簡潔に記述してください。

### 変更内容
`<diff_main.txtの内容>` を基に、変更されたファイルをリストアップし、それぞれの主な変更点を具体的に記述してください。

- `ファイルパス1`
    - 変更点1の具体的な説明
    - 変更点2の具体的な説明
- `ファイルパス2`
    - 変更点1の具体的な説明
    - (ファイルが追加された場合は「新規追加」と記述し、その目的を説明)
    - (ファイルが削除された場合は「削除」と記述し、その理由を説明)
- ...（変更されたファイルごとに繰り返す）

### (任意) 関連するIssueやチケット
関連するIssue番号やチケットへのリンクがあれば記述してください。(例: `Close #123`)

### (任意) スクリーンショットや動作確認
UIの変更や動作確認が必要な場合は、スクリーンショットや確認手順を記述してください。