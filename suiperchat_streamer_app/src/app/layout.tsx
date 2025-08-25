import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "SUIperCHAT Streamer App",
	description:
		"Streamer app for SUIperCHAT - A blockchain-based superchat system on SUI",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					{children}
					{/* バージョン情報を左下に表示 */}
					<div className="fixed bottom-2 left-2 z-50 text-xs text-muted-foreground">
						v{process.env.NEXT_PUBLIC_APP_VERSION}
					</div>
				</ThemeProvider>
			</body>
		</html>
	);
}
