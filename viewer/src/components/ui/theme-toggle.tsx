/**
 * テーマ切り替えコンポーネント
 *
 * ダークモードとライトモードを切り替えるためのボタンコンポーネント。
 * next-themesを使用してテーマの状態管理を行います。
 */

"use client";

import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * テーマ切り替えコンポーネント
 */
export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	// ハイドレーション後にマウント状態を更新
	useEffect(() => {
		setMounted(true);
	}, []);

	// ハイドレーション前は何も表示しない（SSRとの差異を防ぐ）
	if (!mounted) {
		return (
			<Button variant="outline" size="icon" disabled>
				<Sun className="h-4 w-4" />
			</Button>
		);
	}

	const isDark = theme === "dark";

	return (
		<Button
			variant="outline"
			size="icon"
			onClick={() => setTheme(isDark ? "light" : "dark")}
			title={isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
		>
			{isDark ? (
				<Sun className="h-4 w-4" />
			) : (
				<Moon className="h-4 w-4" />
			)}
		</Button>
	);
}