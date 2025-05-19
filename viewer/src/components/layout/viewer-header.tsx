/**
 * 視聴者画面ヘッダーコンポーネント
 *
 * ロゴとウォレット接続ボタンを含むヘッダーを提供します。
 *
 * @remarks
 * - アプリケーションのロゴ（SUIperCHAT）
 * - ウォレット接続ボタン
 * - アスペクト比に基づくレスポンシブ対応
 *
 * @file 視聴者画面のヘッダーコンポーネントを実装
 */

"use client";

import { HeaderWalletButton } from "@/components/wallet/header-wallet-button";
import { useAspectRatio } from "@/hooks/useAspectRatio";
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
	// アスペクト比に基づくレイアウトモードを取得
	const { is_landscape } = useAspectRatio({ threshold: 1.0 });

	return (
		<>
			<Toaster richColors position="top-center" />
			<header
				className={cn(
					"w-full border-b border-border/40",
					is_landscape ? "py-1" : "py-0.5",
					className,
				)}
			>
				<div
					className={cn(
						"container max-w-screen-xl mx-auto flex items-center justify-between",
						is_landscape ? "px-2" : "px-1",
					)}
				>
					<h1
						className={cn("font-bold", is_landscape ? "text-xl" : "text-base")}
					>
						SUIperCHAT
					</h1>
					<HeaderWalletButton />
				</div>
			</header>
		</>
	);
}
