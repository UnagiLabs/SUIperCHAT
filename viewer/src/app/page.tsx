"use client";

import { useWebSocket } from "@/components/providers/WebSocketProvider";
import { Superchat } from "@/components/superchat/superchat";
import { HeaderWalletButton } from "@/components/wallet/header-wallet-button";
import { ConnectionStatus } from "@/lib/types/websocket";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
	const search_params = useSearchParams();
	const { state, actions } = useWebSocket();

	useEffect(() => {
		const ws_url_encoded = search_params.get("wsUrl");
		const streamer_address = search_params.get("streamerAddress");

		if (
			ws_url_encoded &&
			streamer_address &&
			state.status === ConnectionStatus.DISCONNECTED
		) {
			try {
				const ws_url = decodeURIComponent(ws_url_encoded);
				console.log(`Attempting to connect to WebSocket: ${ws_url}`);
				console.log(`Streamer Wallet Address: ${streamer_address}`);
				actions.connect(ws_url);
			} catch (error) {
				console.error("Failed to decode WebSocket URL:", error);
			}
		}
	}, [search_params, state.status, actions]);

	return (
		<div className="grid grid-rows-[auto_1fr_auto] items-center min-h-screen p-8 gap-8 sm:p-10 font-[family-name:var(--font-geist-sans)]">
			<header className="w-full max-w-4xl mx-auto">
				<div className="flex items-center justify-between w-full">
					<h1 className="text-2xl font-bold">SUIperCHAT</h1>
					<HeaderWalletButton />
				</div>
			</header>

			<main className="flex flex-col gap-8 w-full">
				<Superchat />
			</main>

			<footer className="flex gap-[24px] flex-wrap items-center justify-center">
				<div className="text-sm text-muted-foreground">
					© 2023 SUIperCHAT. All rights reserved.
				</div>
			</footer>
		</div>
	);
}
