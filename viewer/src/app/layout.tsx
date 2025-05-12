import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@mysten/dapp-kit/dist/index.css";
import { ClientProviders } from "@/components/providers/client-providers";
import { UserProvider } from "@/context/UserContext";

/**
 * Geistサンフォントの設定
 */
const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

/**
 * Geistモノスペースフォントの設定
 */
const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

/**
 * メタデータの設定
 */
export const metadata: Metadata = {
	title: "SUIperCHAT - Viewer",
	description: "SUIブロックチェーンを使用したスーパーチャットサービス",
	authors: [{ name: "SUIperCHAT Team" }],
};

/**
 * ビューポートの設定
 */
export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 5,
	userScalable: true,
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "white" },
		{ media: "(prefers-color-scheme: dark)", color: "black" },
	],
};

/**
 * ルートレイアウトコンポーネント
 *
 * アプリケーション全体のレイアウトを定義し、クライアントプロバイダーを適用します。
 * 画面左下にアプリケーションのバージョン情報を表示します。
 *
 * @param {Object} props - コンポーネントプロパティ
 * @param {React.ReactNode} props.children - 子コンポーネント
 */
export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>): React.ReactElement {
	const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "不明"; // 環境変数からバージョンを取得

	return (
		<html lang="ja" className="dark">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
			>
				<ClientProviders>
					<UserProvider>{children}</UserProvider>
				</ClientProviders>
				{/* バージョン情報を画面左下に表示 */}
				<div className="fixed bottom-2 left-2 z-50">
					<p className="text-xs text-muted-foreground">v{appVersion}</p>
				</div>
			</body>
		</html>
	);
}
