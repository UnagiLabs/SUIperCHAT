/**
 * ユーザーコンテキスト
 *
 * ユーザー名の状態管理を行うReact Contextを提供します。
 * localStorage を使用してユーザー名を永続化します。
 *
 * @module context/UserContext
 */

"use client";

import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useState,
} from "react";

/**
 * ユーザーコンテキストの型定義
 */
type UserContextType = {
	/**
	 * ユーザー名
	 */
	username: string;

	/**
	 * ユーザー名が設定されているかどうか
	 */
	isUsernameSet: boolean;

	/**
	 * ユーザー名を設定する関数
	 * @param name - 設定するユーザー名
	 */
	setUsername: (name: string) => void;

	/**
	 * ユーザー名をクリアする関数
	 */
	clearUsername: () => void;
};

// ユーザーコンテキストの作成
const UserContext = createContext<UserContextType | undefined>(undefined);

/**
 * ユーザープロバイダーコンポーネント
 *
 * @param props - コンポーネントのプロパティ
 * @param props.children - 子コンポーネント
 * @returns ユーザーコンテキストプロバイダー
 */
export function UserProvider({ children }: { children: ReactNode }) {
	const [username, setUsernameState] = useState<string>("");
	const [isUsernameSet, setIsUsernameSet] = useState<boolean>(false);

	// localStorageからユーザー名を読み込む
	useEffect(() => {
		try {
			const savedName = localStorage.getItem("suiperchat_username");
			if (savedName) {
				// サニタイズ処理（XSS対策）
				const sanitizedName = sanitizeUsername(savedName);
				setUsernameState(sanitizedName);
				setIsUsernameSet(true);
			}
		} catch (error) {
			console.error("ユーザー名の読み込みに失敗しました", error);
		}
	}, []);

	/**
	 * ユーザー名のサニタイズ処理
	 *
	 * @param name - サニタイズするユーザー名
	 * @returns サニタイズされたユーザー名
	 */
	const sanitizeUsername = (name: string): string => {
		// HTMLタグを除去し、長さを制限
		return name.replace(/[<>]/g, "").trim().substring(0, 20);
	};

	/**
	 * ユーザー名を設定し、localStorageに保存
	 *
	 * @param name - 設定するユーザー名
	 */
	const setUsername = (name: string) => {
		try {
			const sanitizedName = sanitizeUsername(name);
			setUsernameState(sanitizedName);
			setIsUsernameSet(true);
			localStorage.setItem("suiperchat_username", sanitizedName);
		} catch (error) {
			console.error("ユーザー名の保存に失敗しました", error);
		}
	};

	/**
	 * ユーザー名をクリア
	 */
	const clearUsername = () => {
		setUsernameState("");
		setIsUsernameSet(false);
		try {
			localStorage.removeItem("suiperchat_username");
		} catch (error) {
			console.error("ユーザー名のクリアに失敗しました", error);
		}
	};

	return (
		<UserContext.Provider
			value={{ username, isUsernameSet, setUsername, clearUsername }}
		>
			{children}
		</UserContext.Provider>
	);
}

/**
 * ユーザーコンテキストを使用するためのカスタムフック
 *
 * @returns ユーザーコンテキスト
 * @throws UserProviderの外部で使用された場合にエラーをスローします
 */
export function useUser() {
	const context = useContext(UserContext);
	if (context === undefined) {
		throw new Error("useUser must be used within a UserProvider");
	}
	return context;
}
