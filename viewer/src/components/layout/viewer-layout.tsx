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
 *
 * @file 視聴者画面のレイアウトコンポーネントを実装
 */

"use client";

import { useAspectRatio } from "@/hooks/useAspectRatio";
import { cn } from "@/lib/utils";
import type React from "react";

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

	return (
		<div
			className={cn("w-full max-w-7xl mx-auto h-full flex flex-col", className)}
		>
			{/* レイアウトをアスペクト比に基づいて切り替え */}
			<div
				className={cn(
					"flex w-full gap-2 flex-grow",
					is_landscape ? "flex-row" : "flex-col",
				)}
			>
				{/* 動画エリア (横長: 70%, 縦長: 100%) */}
				<div
					className={cn(
						"w-full min-h-[180px]",
						is_landscape ? "w-[70%] min-h-[300px]" : "",
					)}
				>
					{video_player}
				</div>

				{/* コメントとスーパーチャットの統合エリア (横長: 30%, 縦長: 100%) */}
				<div
					className={cn(
						"w-full border rounded-lg overflow-hidden flex flex-col",
						is_landscape
							? "w-[30%] h-[calc(100vh-150px)] max-h-[800px] min-h-[400px]"
							: "h-[calc(100vh-320px)] min-h-[250px]",
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
