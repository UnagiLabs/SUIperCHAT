/**
 * 視聴者画面レイアウトコンポーネント
 *
 * 動画埋め込み、コメント表示、スーパーチャット送信フォームを一体化したレイアウトを提供します。
 * 横長（PC）と縦長（スマホ）のそれぞれに最適化されたレスポンシブなレイアウトを実装しています。
 *
 * @remarks
 * - 横長画面では左側70%に動画、右側30%にコメント表示+スーパーチャットフォームを配置
 * - 縦長画面では上から順に動画→コメント表示+スーパーチャットフォームの縦長配置
 * - メディアクエリではなく、アスペクト比（縦横比）に基づいてレイアウトを切り替え
 * - スマホ横画面時は動画とコメント比率を最適化
 *
 * @file 視聴者画面のレイアウトコンポーネントを実装
 */

"use client";

import { useAspectRatio } from "@/hooks/useAspectRatio";
import { cn } from "@/lib/utils";
import type React from "react";
import { useEffect, useState } from "react";

/**
 * ウィンドウサイズを取得するカスタムフック
 *
 * @returns ウィンドウの幅と高さ
 */
function useWindowSize() {
	const [window_size, set_window_size] = useState({
		window_width: typeof window !== "undefined" ? window.innerWidth : 0,
		window_height: typeof window !== "undefined" ? window.innerHeight : 0,
	});

	useEffect(() => {
		function handle_resize() {
			set_window_size({
				window_width: window.innerWidth,
				window_height: window.innerHeight,
			});
		}

		window.addEventListener("resize", handle_resize);
		handle_resize();

		return () => window.removeEventListener("resize", handle_resize);
	}, []);

	return window_size;
}

/**
 * 視聴者画面レイアウトコンポーネントのプロパティ
 */
interface ViewerLayoutProps {
	/**
	 * 動画プレーヤーコンポーネント
	 */
	video_player: React.ReactNode;

	/**
	 * コメントリストコンポーネント
	 */
	comment_list: React.ReactNode;

	/**
	 * スーパーチャットフォームコンポーネント
	 */
	superchat_form: React.ReactNode;

	/**
	 * コンポーネントのクラス名
	 */
	className?: string;
}

/**
 * 視聴者画面レイアウトコンポーネント
 *
 * 動画・コメント・スーパーチャットフォームを一体化したレイアウトを提供します。
 * 横長と縦長でそれぞれ最適なレイアウトに自動調整されます。
 *
 * @param props - コンポーネントのプロパティ
 * @returns 視聴者画面レイアウトのJSXエレメント
 */
export function ViewerLayout({
	video_player,
	comment_list,
	superchat_form,
	className,
}: ViewerLayoutProps): React.ReactElement {
	// アスペクト比に基づくレイアウトモードを取得
	const { is_landscape } = useAspectRatio({ threshold: 1.0 });
	// 画面幅を取得
	const { window_width } = useWindowSize();

	// スマホ横画面かどうかを判定（768px未満をスマホと判定）
	const is_mobile_landscape = is_landscape && window_width < 768;

	return (
		<div
			className={cn("w-full max-w-7xl mx-auto h-full flex flex-col", className)}
		>
			{/* レイアウトをアスペクト比に基づいて切り替え */}
			<div
				className={cn(
					"flex w-full gap-2 flex-grow box-border",
					is_landscape ? "flex-row" : "flex-col",
				)}
			>
				{/* 動画エリア - デバイスに応じて最適化 */}
				<div
					className={cn(
						"min-h-[180px]",
						is_mobile_landscape
							? "flex-[6_0_0%] min-h-[140px]"
							: is_landscape
								? "flex-[7_0_0%] min-h-[300px]"
								: "w-full",
					)}
				>
					{video_player}
				</div>

				{/* コメントとスーパーチャットの統合エリア - デバイスに応じて最適化 */}
				<div
					className={cn(
						"border rounded-lg overflow-hidden flex flex-col",
						is_mobile_landscape
							? "flex-[4_0_0%] h-[calc(100vh-80px)] min-h-[140px]"
							: is_landscape
								? "flex-[3_0_0%] h-[calc(100vh-150px)] max-h-[800px] min-h-[400px]"
								: "w-full h-[calc(100vh-320px)] min-h-[250px]",
					)}
				>
					{/* コメントエリア - 高さを調整して上部に配置 */}
					<div className="flex-grow overflow-auto">{comment_list}</div>

					{/* 区切り線 */}
					<div className="border-t border-border/40" />

					{/* スーパーチャットエリア - 下部に固定 */}
					<div className="w-full shrink-0">{superchat_form}</div>
				</div>
			</div>
		</div>
	);
}
