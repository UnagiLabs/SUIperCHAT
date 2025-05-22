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
 *
 * @module app/page
 * @returns {React.ReactNode} ルートページのレンダリング結果
 */
export default function RootPage(): React.ReactNode {
	return (
		<div className="container mx-auto p-4">
			<h1 className="text-3xl font-bold mb-6">SUIperCHAT Streamer</h1>

			<div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
				{/* 左側のカラム - 既存のダッシュボードコンポーネント */}
				<div className="space-y-6">
					{/* 配信者設定コンポーネント（ウォレットアドレスとYouTube URL） */}
					<StreamerConfig />

					{/* サーバー制御コンポーネント */}
					<ServerControl />

					{/* URL表示コンポーネント */}
					<UrlDisplay />
				</div>

				{/* 右側のカラム - コメント表示 */}
				<div className="lg:h-[calc(100vh-120px)] sticky top-4">
					<CommentDisplay />
				</div>
			</div>

			{/* Toast表示用のコンポーネント (sonnerを使用) */}
			<SonnerToaster />
		</div>
	);
}
