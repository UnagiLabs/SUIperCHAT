/**
 * 視聴者ページ
 *
 * 視聴者としてライブ配信を視聴するためのメインページ。
 * 動画の埋め込み、コメント表示、スーパーチャット送信機能を提供します。
 *
 * @remarks
 * - 横長（PC）と縦長（スマホ）でレスポンシブに対応
 * - 各コンポーネントが統合された一体的なUI
 * - アスペクト比（縦横比）に基づくレイアウト切り替え
 * - URLパラメータからWebSocket URLと配信者アドレスを取得
 *
 * @file 視聴者メインページの実装
 */

import { CommentList } from "@/components/comments/comment-list";
import { ViewerHeader } from "@/components/layout/viewer-header";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { Superchat } from "@/components/superchat/superchat";
import { VideoPlayer } from "@/components/video/video-player";
import WebSocketUrlHandler from "@/components/websocket/websocket-url-handler";
import { useAspectRatio } from "@/hooks/useAspectRatio";
import { getServerConfig } from "@/lib/server-config";
import { cn } from "@/lib/utils";

/**
 * 視聴者向けホームページコンポーネント
 *
 * @returns 視聴者ページのJSXエレメント
 */
export default async function HomePage() {
	// サーバー設定を取得
	const config = await getServerConfig();

	return (
		<>
			{/* WebSocketのURL処理用コンポーネント (URLパラメータからWS接続) */}
			<WebSocketUrlHandler />

			<ViewerHeader />
			<main className="container max-w-screen-xl mx-auto p-0.5 md:p-1">
				<ViewerLayout
					video_player={
						<VideoPlayer
							video_url={
								config?.streamUrl ||
								"https://www.youtube.com/watch?v=jfKfPfyJRdk"
							}
							fallback_content={
								<div className="w-full h-full flex items-center justify-center bg-muted">
									<p className="text-center p-4">
										動画URLが設定されていないか、読み込みに失敗しました。
									</p>
								</div>
							}
						/>
					}
					comment_list={<CommentList auto_scroll={true} />}
					superchat_form={
						<Superchat
							initial_recipient_address={config?.walletAddress || ""}
							compact_mode={true}
						/>
					}
				/>
			</main>
		</>
	);
}
