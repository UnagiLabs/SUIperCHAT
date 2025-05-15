/**
 * 視聴者画面レイアウトコンポーネント
 *
 * 動画埋め込み、コメント表示、スーパーチャット送信フォームを一体化したレイアウトを提供します。
 * PCとモバイルそれぞれに最適化されたレスポンシブなレイアウトを実装しています。
 *
 * @remarks
 * - PC画面では左側70%に動画、右側30%にコメント表示+スーパーチャットフォームを配置
 * - モバイル画面では上から順に動画→コメント表示+スーパーチャットフォームの縦長配置
 *
 * @file 視聴者画面のレイアウトコンポーネントを実装
 */

"use client";

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
 * PCとモバイルでそれぞれ最適なレイアウトに自動調整されます。
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
	return (
		<div
			className={cn("w-full max-w-7xl mx-auto h-full flex flex-col", className)}
		>
			{/* PC: 横並び (左70%:右30%) / モバイル: 縦並び */}
			<div className="flex flex-col md:flex-row w-full gap-4 flex-grow">
				{/* 動画エリア (PC: 70%, モバイル: 100%) */}
				<div className="w-full md:w-[70%] min-h-[300px]">{video_player}</div>

				{/* コメントとスーパーチャットの統合エリア (PC: 30%, モバイル: 100%) */}
				<div className="w-full md:w-[30%] border rounded-lg overflow-hidden flex flex-col h-[calc(100vh-200px)] md:h-[calc(100vh-150px)] max-h-[800px] min-h-[400px]">
					{/* コメントエリア - 高さを調整して上部に配置 */}
					<div className="flex-grow overflow-auto">{comment_list}</div>

					{/* 区切り線 */}
					<div className="border-t border-border/40" />

					{/* スーパーチャットエリア - 下部に固定 */}
					<div className="w-full">{superchat_form}</div>
				</div>
			</div>
		</div>
	);
}
