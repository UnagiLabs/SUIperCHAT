/**
 * クライアントプロバイダーコンポーネント
 *
 * クライアントサイドでのみ実行される必要があるプロバイダーをまとめて提供します。
 * Sui SDKのプロバイダーやクエリクライアント、WebSocketプロバイダーなどを含みます。
 *
 * @module components/providers/client-providers
 */

"use client";

import { WebSocketProvider } from "@/components/providers/WebSocketProvider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import {
	SuiClientProvider,
	WalletProvider,
	createNetworkConfig,
} from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { type ReactNode, useState } from "react";

/**
 * クライアントプロバイダーコンポーネントのプロパティ
 */
interface ClientProvidersProps {
	children: ReactNode;
}

/**
 * クライアントプロバイダーコンポーネント
 *
 * @param {ClientProvidersProps} props - コンポーネントプロパティ
 * @returns {JSX.Element} クライアントプロバイダー
 */
export function ClientProviders({
	children,
}: ClientProvidersProps): React.ReactElement {
	// QueryClientインスタンスをコンポーネント内で初期化
	const [queryClient] = useState(() => new QueryClient());

	// Sui SDKのネットワーク設定
	const { networkConfig } = createNetworkConfig({
		mainnet: { url: getFullnodeUrl("mainnet") },
		testnet: { url: getFullnodeUrl("testnet") },
	});

	return (
		<QueryClientProvider client={queryClient}>
			<SuiClientProvider networks={networkConfig} defaultNetwork="mainnet">
				<WalletProvider>
					<ThemeProvider defaultTheme="system" storageKey="suiperchat-theme">
						<WebSocketProvider>{children}</WebSocketProvider>
					</ThemeProvider>
				</WalletProvider>
			</SuiClientProvider>
		</QueryClientProvider>
	);
}
