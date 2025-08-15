## What it does

SUIperCHAT is a Super Chat middleware on the high-speed, low-fee SUI L1 blockchain.
Creators stream on YouTube, input their video URL into SUIperCHAT, and instantly receive direct crypto donations via a 3-click flow (Connect wallet → Enter amount/message → Send).
OBS overlays display donations in real time, while Move smart contracts handle on-chain settlement.

## The problem it solves

Existing Super Chat systems take large cuts, impose withdrawal thresholds, and lock creators to a single platform’s rules.
SUIperCHAT keeps streaming on existing platforms but replaces the payment layer with low, transparent-fee blockchain transfers — instant settlement, no intermediaries.

## Challenges I ran into

- No central app server: streamer-side WebSocket server + Cloudflare Tunnel for secure viewer access
- Stable cross-platform desktop app (Rust/Tauri) with sub-second overlay updates
- Managing persistent session history with SQLite while keeping performance high

## Technologies I used

Frontend: Next.js (React), TypeScript, shadcn/UI, Tailwind
Blockchain: SUI TypeScript SDK, Move smart contracts
Desktop: Tauri (Rust), Actix Web, Tokio, SQLite/SQLx
Infra: Cloudflare Tunnel, WebSocket

## How we built it

1) Move contracts on SUI for transparent, low-fee payment processing
2) Viewer web app with SUI wallet integration and 3-click UX
3) Streamer Tauri app (WebSocket/HTTP, DB, cloudflared) + OBS browser sources
4) YouTube URL input to link live stream and donation display
5) Session-based history for donations and messages

## What we learned

- Simplified blockchain UX (“Wallet → Amount → Send”) is key to adoption
- Clear value props (low fee × instant payout) resonate more than abstract Web3 terms
- Rust/Tauri enables performant cross-platform tools without burdening streaming performance
- Automated Cloudflare Tunnel management makes streamer-side hosting practical

## What's next for

- Expand platform compatibility beyond YouTube while staying a payment-layer middleware, not a streaming platform
- NFT-based “early supporter” system: record historical contributions on-chain, enabling long-term fans to share in creator growth
- Mobile app allowing full streaming capability without a desktop setup
- Broaden support to other SUI-based tokens
