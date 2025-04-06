/**
 * テーマ切り替えボタンコンポーネント
 *
 * ユーザーがダークモード、ライトモード、システムテーマを切り替えるためのドロップダウンメニューを提供します。
 *
 * @module ThemeToggle
 */

"use client";

import { useEffect, useState } from "react";
import { useTheme } from "./theme-provider";

/**
 * テーマ切り替えボタンコンポーネント
 * @returns {JSX.Element} テーマ切り替えボタンのUI
 */
export function ThemeToggle() {
	const { theme, set_theme } = useTheme();
	const [mounted, set_mounted] = useState(false);

	// マウント時にハイドレーションエラーを防ぐ
	useEffect(() => {
		set_mounted(true);
	}, []);

	if (!mounted) {
		return null;
	}

	return (
		<div className="flex items-center space-x-4">
			<button
				type="button"
				className={`px-3 py-2 rounded transition-colors ${
					theme === "light"
						? "bg-secondary text-secondary-foreground"
						: "text-muted-foreground hover:text-foreground"
				}`}
				onClick={() => set_theme("light")}
				aria-label="ライトモード"
			>
				<SunIcon className="h-5 w-5" />
			</button>

			<button
				type="button"
				className={`px-3 py-2 rounded transition-colors ${
					theme === "dark"
						? "bg-secondary text-secondary-foreground"
						: "text-muted-foreground hover:text-foreground"
				}`}
				onClick={() => set_theme("dark")}
				aria-label="ダークモード"
			>
				<MoonIcon className="h-5 w-5" />
			</button>

			<button
				type="button"
				className={`px-3 py-2 rounded transition-colors ${
					theme === "system"
						? "bg-secondary text-secondary-foreground"
						: "text-muted-foreground hover:text-foreground"
				}`}
				onClick={() => set_theme("system")}
				aria-label="システムテーマ"
			>
				<ComputerIcon className="h-5 w-5" />
			</button>
		</div>
	);
}

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>太陽アイコン</title>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2" />
			<path d="M12 20v2" />
			<path d="m4.93 4.93 1.41 1.41" />
			<path d="m17.66 17.66 1.41 1.41" />
			<path d="M2 12h2" />
			<path d="M20 12h2" />
			<path d="m6.34 17.66-1.41 1.41" />
			<path d="m19.07 4.93-1.41 1.41" />
		</svg>
	);
}

function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>月アイコン</title>
			<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
		</svg>
	);
}

function ComputerIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			{...props}
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>システムアイコン</title>
			<rect width="14" height="8" x="5" y="2" rx="2" />
			<rect width="20" height="8" x="2" y="14" rx="2" />
			<path d="M6 18h2" />
			<path d="M12 18h6" />
		</svg>
	);
}
