# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SUIperCHAT Streamer App is a Tauri-based desktop application that enables streamers to integrate SUI blockchain SuperChat functionality with OBS streaming software. The app serves as a bridge between viewers sending SUI-based donations and streamers displaying these donations as overlays.

## Architecture

### Hybrid Stack
- **Frontend**: Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **Backend**: Rust + Tauri 2.x framework  
- **Database**: SQLite with SQLx (dev.db for development)
- **Communication**: WebSocket server for real-time messaging
- **UI Components**: shadcn/ui + Radix UI primitives

### Core Components

**Tauri Backend** (`/src-tauri/src/`):
- `commands/`: Tauri command handlers for frontend-backend communication
- `ws_server/`: WebSocket server managing client connections and real-time messaging
- `database.rs` & `db_models.rs`: SQLite database layer with sessions and messages tables
- `state.rs`: Global application state management

**Next.js Frontend** (`/src/`):
- `app/`: Next.js 15 app router with main dashboard page
- `components/features/dashboard/`: Core UI components (ServerControl, CommentDisplay, etc.)
- `components/ui/`: Reusable shadcn/ui components
- `lib/`: Utility functions and TypeScript type definitions

**OBS Integration** (`/src-tauri/src/static/obs/`):
- Browser source files for displaying SuperChats in streaming software
- WebSocket client for real-time message updates

## Development Commands

### Development
```bash
npm run dev          # Start Next.js development server (frontend only)
npm run tauri dev    # Start full Tauri development mode with hot reload
```

### Production Build
```bash
npm run build        # Build Next.js for production
npm run tauri build  # Build complete desktop app with installers
```

### Code Quality
```bash
npm run check        # Run Biome formatter and linter
```

### Tauri-specific
```bash
npm run tauri dev        # Development mode with hot reload
npm run tauri build      # Production build with platform installers
npm run tauri -- --help # Access Tauri CLI help
```

## Key Patterns

### Frontend-Backend Communication
- Use Tauri commands (`invoke()`) for request-response operations
- Use Tauri events for real-time updates from backend to frontend
- WebSocket server handles external client connections (viewers, OBS)

### Database Sessions
- Each streaming session has a unique ID
- Messages are associated with sessions for historical tracking
- Database uses WAL mode for concurrent access

### State Management
- Tauri manages global application state in Rust
- React components use local state and Tauri command calls
- WebSocket connections maintained in backend state

### UI Component Structure
- Dashboard uses two-column layout (494px config, 680px history)
- Components follow shadcn/ui patterns with Radix primitives
- Real-time updates flow from WebSocket → Tauri events → React state

## Important File Locations

### Configuration
- `tauri.conf.json`: Tauri app configuration and permissions
- `Cargo.toml`: Rust dependencies and build settings
- `package.json`: Node.js dependencies and scripts

### Development Database
- `dev.db`: SQLite database file (development only)
- Production uses platform-specific app data directories

### Build Outputs
- Windows: `src-tauri/target/release/bundle/msi/` or `/nsis/`
- macOS: `src-tauri/target/release/bundle/dmg/` or `/macos/`

## Development Notes

### Platform-specific Considerations
- Windows builds require Npcap SDK for network functionality
- macOS builds generate both .dmg and .app bundle formats
- Both platforms support automatic updates through Tauri

### Testing Approach
- Frontend components can be tested with standard React testing tools
- Backend Rust code uses standard `cargo test`
- Integration testing requires full Tauri development environment

### Database Migrations
- Database schema changes should update both `database.rs` and `db_models.rs`
- Development database can be reset by deleting `dev.db` file
- Production migrations need careful consideration for user data

When making changes, always test in both development (`npm run tauri dev`) and production build modes, as they use different database locations and configurations.

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