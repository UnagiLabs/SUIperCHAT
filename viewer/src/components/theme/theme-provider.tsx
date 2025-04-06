/**
 * テーマプロバイダーコンポーネント
 *
 * アプリケーション全体のテーマ状態を管理し、ダークモードとライトモードの切り替えを提供します。
 * ユーザーの設定をローカルストレージに保存し、システム設定も考慮します。
 *
 * @module ThemeProvider
 */

"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
	children: React.ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	theme: Theme;
	set_theme: (theme: Theme) => void;
	is_system_theme: boolean;
};

const initialize_theme = (storageKey: string, defaultTheme: Theme): Theme => {
	if (typeof window === "undefined") {
		return defaultTheme;
	}

	const stored_theme = localStorage.getItem(storageKey);

	if (stored_theme && ["dark", "light", "system"].includes(stored_theme)) {
		return stored_theme as Theme;
	}

	return defaultTheme;
};

const ThemeContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "ui-theme",
	...props
}: ThemeProviderProps) {
	const [theme, set_theme] = useState<Theme>(() =>
		initialize_theme(storageKey, defaultTheme),
	);
	const is_system_theme = theme === "system";

	useEffect(() => {
		const root = window.document.documentElement;
		root.classList.remove("light", "dark");

		if (theme === "system") {
			const system_theme = window.matchMedia("(prefers-color-scheme: dark)")
				.matches
				? "dark"
				: "light";
			root.classList.add(system_theme);
			return;
		}

		root.classList.add(theme);
	}, [theme]);

	// システムテーマの変更を監視
	useEffect(() => {
		if (theme !== "system") return;

		const media_query = window.matchMedia("(prefers-color-scheme: dark)");

		const handle_change = () => {
			const root = window.document.documentElement;
			const system_theme = media_query.matches ? "dark" : "light";

			root.classList.remove("light", "dark");
			root.classList.add(system_theme);
		};

		media_query.addEventListener("change", handle_change);
		return () => media_query.removeEventListener("change", handle_change);
	}, [theme]);

	useEffect(() => {
		localStorage.setItem(storageKey, theme);
	}, [theme, storageKey]);

	const value = {
		theme,
		set_theme,
		is_system_theme,
	};

	return (
		<ThemeContext.Provider {...props} value={value}>
			{children}
		</ThemeContext.Provider>
	);
}

/**
 * テーマコンテキストを使用するためのカスタムフック
 *
 * @returns テーマの状態と操作関数
 * @throws ThemeProviderが見つからない場合にエラーをスロー
 */
export function useTheme() {
	const context = useContext(ThemeContext);

	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}

	return context;
}
