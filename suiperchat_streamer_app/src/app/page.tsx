import ConnectionManager from "@/components/features/dashboard/ConnectionManager";
import ServerControl from "@/components/features/dashboard/ServerControl";
import UrlDisplay from "@/components/features/dashboard/UrlDisplay";
import WalletAddressConfig from "@/components/features/dashboard/WalletAddressConfig";
import { Toaster as SonnerToaster } from "@/components/ui/sonner"; // shadcn/uiのsonnerコンポーネント
/**
 * SUIperCHAT ルートページコンポーネント (配信者ダッシュボード)
 *
 * アプリケーションのエントリーポイント。
 * サーバー制御やURL表示などの主要な配信者向け機能を提供します。
 *
 * @module app/page
 * @returns {React.ReactNode} ルートページのレンダリング結果
 */
import type React from "react";

/**
 * ルートページコンポーネント（配信者ダッシュボード）
 *
 * アプリケーションのエントリーポイント。
 * サーバー制御やURL表示などの主要な配信者向け機能を提供します。
 *
 * @module app/page
 * @returns {React.ReactNode} ルートページのレンダリング結果
 */
export default function RootPage(): React.ReactNode {
	return (
		<div className="container mx-auto p-4 space-y-6">
			<h1 className="text-3xl font-bold">SUIperCHAT Streamer</h1>

			{/* ウォレットアドレス設定コンポーネント */}
			<WalletAddressConfig />

			{/* サーバー制御コンポーネント */}
			<ServerControl />

			{/* URL表示コンポーネント */}
			<UrlDisplay />

			{/* 接続管理コンポーネント */}
			<ConnectionManager />

			{/* Toast表示用のコンポーネント (sonnerを使用) */}
			<SonnerToaster />
		</div>
	);
}
