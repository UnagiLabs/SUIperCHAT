/**
 * テーマ切り替えボタンコンポーネント
 * 
 * ダークモードとライトモードを切り替えるためのボタンを提供します。
 */
"use client";

import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	// クライアントサイドでマウントされた後にコンポーネントを表示
	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		// SSR中は何も表示しない
		return null;
	}

	return (
		<Button
			variant="ghost"
			size="sm"
			className="h-8 w-8 p-0"
			onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
			aria-label="テーマを切り替え"
		>
			{theme === "dark" ? (
				<Sun className="h-4 w-4" />
			) : (
				<Moon className="h-4 w-4" />
			)}
		</Button>
	);
}