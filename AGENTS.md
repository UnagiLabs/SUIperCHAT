# Repository Guidelines

## Project Structure & Module Organization
- `viewer/`: Next.js 15 frontend for viewers; key code in `src/` (UI) and `lib/`; config (Biome, Tailwind) at root.
- `suiperchat_streamer_app/`: Tauri desktop app with Next.js UI (`src/`) and Rust backend in `src-tauri/` (WebSocket, HTTP, SQLite).
- `contract/suiperchat/`: Move package with `sources/` smart-contracts and `tests/` integration specs; requires the Sui CLI.
- Supporting docs live in `docs/` and `presentation/`; follow `README.md` links for domain-specific setup.

## Build, Test, and Development Commands
- Viewer: `cd viewer && npm run dev` starts Turbopack; `npm run build && npm run start` serves the optimized bundle.
- Streamer app: `cd suiperchat_streamer_app && npm run dev` for UI; `npm run tauri dev` launches the Rust shell; `npm run build` prepares assets before packaging.
- Contracts: `cd contract/suiperchat && sui move build` validates modules; `sui move test` executes on-chain logic checks (install Sui CLI first).

## Coding Style & Naming Conventions
- TypeScript/React code uses Biome; run `npm run check` in each app before committing. Prefer PascalCase component files (`components/ViewerHeader.tsx`), camelCase hooks (`useWebSocketConnect.ts`), and keep configuration in `.env.local`.
- Tailwind utility classes follow shadcn patterns; colocate shared UI primitives under `components/`.
- Rust code follows `cargo fmt` defaults; features live under `src-tauri/src/**` with snake_case filenames.

## Testing Guidelines
- Prioritize Move coverage via `sui move test`; extend `tests/payment_tests.move` when fee logic changes.
- Frontend layers currently lack automated tests—add React Testing Library specs in `viewer/src/__tests__` and `suiperchat_streamer_app/src/__tests__` using `*.test.tsx` naming.
- When modifying WebSocket flows, run both apps locally and validate message delivery using the default `NEXT_PUBLIC_WS_URL`.

## Commit & Pull Request Guidelines
- Match the existing convention `[type] short summary`, e.g., `[feat] Add OBS theme toggles`; keep the verb in present tense and under 72 characters.
- One feature per commit; include context about the touched package in the body.
- PRs should link related issues, note manual test steps (`viewer npm run dev`, `sui move test`), and attach UI screenshots or recordings for user-facing work.

## Security & Configuration Tips
- Never commit real wallet mnemonics or tunnel secrets; rely on `.env.local` templates and share sensitive values out-of-band.
- Rotate Cloudflare Tunnel tokens when exposing the streamer WebSocket and capture endpoints in `docs/` instead of source.
