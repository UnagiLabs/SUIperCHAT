import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";

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
 * アプリケーション全体のレイアウトを定義し、テーマプロバイダーを適用します。
 *
 * @param {Object} props - コンポーネントプロパティ
 * @param {React.ReactNode} props.children - 子コンポーネント
 * @returns {JSX.Element} ルートレイアウト
 */
export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ja" suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
			>
				<ThemeProvider defaultTheme="system" storageKey="suiperchat-theme">
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
