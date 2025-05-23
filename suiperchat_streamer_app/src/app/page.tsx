import CommentDisplay from "@/components/features/dashboard/CommentDisplay";
import ServerControl from "@/components/features/dashboard/ServerControl";
import StreamerConfig from "@/components/features/dashboard/StreamerConfig";
import UrlDisplay from "@/components/features/dashboard/UrlDisplay";
import { Toaster as SonnerToaster } from "@/components/ui/sonner"; // shadcn/uiのsonnerコンポーネント
/**
 * SUIperCHAT ルートページコンポーネント (配信者ダッシュボード)
 *
 * アプリケーションのエントリーポイント。
 * サーバー制御やURL表示などの主要な配信者向け機能を提供します。
 * 1260*700の画面サイズに最適化され、左4：右6の固定幅レイアウトを採用。
 *
 * @module app/page
 * @returns {React.ReactNode} ルートページのレンダリング結果
 */
import type React from "react";

/**
 * ルートページコンポーネント（配信者ダッシュボード）
 *
 * アプリケーションのエントリーポイント。
 * サーバー制御やURL表示などの主要な配信者向け機能と、
 * コメント表示機能を提供します。
 * 1260*700の画面サイズでスクロールなしで表示できるよう最適化されています。
 *
 * @module app/page
 * @returns {React.ReactNode} ルートページのレンダリング結果
 */
export default function RootPage(): React.ReactNode {
	return (
		<div className="min-h-screen max-h-screen overflow-hidden">
			<div className="container mx-auto p-4 h-screen flex flex-col">
				<h1 className="text-3xl font-bold mb-4 flex-shrink-0">
					SUIperCHAT Streamer
				</h1>

				<div className="flex gap-6 flex-grow min-h-0">
					{/* 左側のカラム - 既存のダッシュボードコンポーネント（固定幅494px） */}
					<div className="w-[494px] flex-shrink-0 space-y-4 overflow-y-auto">
						{/* 配信者設定コンポーネント（ウォレットアドレスとYouTube URL） */}
						<StreamerConfig />

						{/* サーバー制御コンポーネント */}
						<ServerControl />

						{/* URL表示コンポーネント */}
						<UrlDisplay />
					</div>

					{/* 右側のカラム - コメント表示（固定幅742px） */}
					<div className="w-[742px] flex-shrink-0 min-h-0">
						<CommentDisplay />
					</div>
				</div>

				{/* Toast表示用のコンポーネント (sonnerを使用) */}
				<SonnerToaster />
			</div>
		</div>
	);
}
