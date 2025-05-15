/**
 * 視聴者画面ヘッダーコンポーネント
 *
 * ロゴとウォレット接続ボタンを含むヘッダーを提供します。
 *
 * @remarks
 * - アプリケーションのロゴ（SUIperCHAT）
 * - ウォレット接続ボタン
 *
 * @file 視聴者画面のヘッダーコンポーネントを実装
 */

"use client";

import { HeaderWalletButton } from "@/components/wallet/header-wallet-button";
import { cn } from "@/lib/utils";
import type React from "react";
import { Toaster } from "sonner";

/**
 * 視聴者画面ヘッダーコンポーネントのプロパティ
 */
interface ViewerHeaderProps {
	/**
	 * コンポーネントのクラス名
	 */
	className?: string;
}

/**
 * 視聴者画面ヘッダーコンポーネント
 *
 * @param props - コンポーネントのプロパティ
 * @returns 視聴者画面ヘッダーのJSXエレメント
 */
export function ViewerHeader({
	className,
}: ViewerHeaderProps): React.ReactElement {
	return (
		<>
			<Toaster richColors position="top-center" />
			<header
				className={cn(
					"w-full py-2 md:py-3 border-b border-border/40",
					className,
				)}
			>
				<div className="container max-w-screen-xl mx-auto px-2 md:px-3 flex items-center justify-between">
					<h1 className="text-xl md:text-2xl font-bold">SUIperCHAT</h1>
					<HeaderWalletButton />
				</div>
			</header>
		</>
	);
}
