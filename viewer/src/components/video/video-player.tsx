/**
 * 動画プレーヤーコンポーネント
 *
 * 配信サイト（YouTubeなど）の動画を埋め込むためのコンポーネント。
 * 現時点ではYouTube Liveの埋め込みに対応しています。
 *
 * @remarks
 * - アスペクト比を維持しながらレスポンシブに表示
 * - 将来的な拡張性を考慮した設計
 *
 * @file 動画埋め込みコンポーネントの実装
 */

"use client";

import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

/**
 * 動画プレーヤーコンポーネントのプロパティ
 */
interface VideoPlayerProps {
	/**
	 * 埋め込み動画のURL
	 * YouTubeの場合は通常のURL（https://www.youtube.com/watch?v=...）を指定
	 */
	video_url?: string;

	/**
	 * コンポーネントのクラス名
	 */
	className?: string;

	/**
	 * 動画が利用できない場合に表示する代替コンテンツ
	 */
	fallback_content?: React.ReactNode;
}

/**
 * 動画プレーヤーコンポーネント
 *
 * @param props - コンポーネントのプロパティ
 * @returns 動画プレーヤーのJSXエレメント
 */
export function VideoPlayer({
	video_url,
	className,
	fallback_content,
}: VideoPlayerProps) {
	const [is_client, set_is_client] = useState(false);

	// クライアントサイドでのみレンダリングするための対応
	useEffect(() => {
		set_is_client(true);
	}, []);

	// YouTube URLからembed用のURLに変換
	const embed_url = useMemo(() => {
		if (!video_url) return null;

		try {
			// YouTube URL形式の確認とパース
			if (video_url.includes("youtube.com") || video_url.includes("youtu.be")) {
				let video_id = "";

				// 標準的なYouTube URL (www.youtube.com/watch?v=VIDEO_ID)
				if (video_url.includes("youtube.com/watch")) {
					const url = new URL(video_url);
					video_id = url.searchParams.get("v") || "";
				}
				// 短縮URL (youtu.be/VIDEO_ID)
				else if (video_url.includes("youtu.be")) {
					const path = new URL(video_url).pathname;
					video_id = path.split("/").filter(Boolean)[0];
				}
				// YouTube Live URL (youtube.com/live/VIDEO_ID)
				else if (video_url.includes("youtube.com/live")) {
					const path = new URL(video_url).pathname;
					video_id = path.split("/").filter(Boolean)[1];
				}

				if (video_id) {
					// YouTube埋め込みURLを構築
					return `https://www.youtube.com/embed/${video_id}?autoplay=1&rel=0`;
				}
			}

			// その他の埋め込み可能なURL形式はそのまま使用
			return video_url;
		} catch (error) {
			console.error("動画URLの解析に失敗しました:", error);
			return null;
		}
	}, [video_url]);

	// 利用可能な動画URLがない場合はフォールバックコンテンツを表示
	if (!embed_url || !is_client) {
		return (
			<div
				className={cn(
					"w-full aspect-video bg-card border rounded-lg flex items-center justify-center",
					className,
				)}
			>
				{fallback_content || (
					<div className="text-center p-4">
						<p className="text-muted-foreground">
							{video_url
								? "動画の読み込みに失敗しました"
								: "ライブストリームのURLが設定されていません"}
						</p>
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"w-full aspect-video bg-card border rounded-lg overflow-hidden",
				className,
			)}
		>
			<iframe
				src={embed_url}
				className="w-full h-full"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
				allowFullScreen
				title="Embedded Stream"
			/>
		</div>
	);
}
