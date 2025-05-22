/**
 * YouTube Live URL設定コンポーネント
 *
 * 配信者のYouTube LiveのURLを設定するためのフォームを提供します。
 * 設定されたURLは視聴者サイトで埋め込み表示されます。
 * アプリ起動ごとにリセットされる一時的な設定です。
 */

"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invoke } from "@tauri-apps/api/core";
import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * YouTube URLを検証し、動画IDを抽出する関数
 * @param {string} url - 検証するYouTube URL
 * @returns {{ isValid: boolean, videoId?: string, error?: string }} - 検証結果
 */
function validateAndExtractYouTubeVideoId(url: string): {
	isValid: boolean;
	videoId?: string;
	error?: string;
} {
	// 空のURLをチェック
	const trimmedUrl = url.trim();
	if (!trimmedUrl) {
		return { isValid: false, error: "Please enter a YouTube URL." };
	}

	// URLの安全性を確認（HTTPSプロトコル）
	try {
		const urlObj = new URL(trimmedUrl);
		if (urlObj.protocol !== "https:") {
			return {
				isValid: false,
				error: "URL must use HTTPS protocol for security.",
			};
		}

		// YouTube URLかどうかを確認
		const isYouTubeUrl =
			urlObj.hostname === "www.youtube.com" ||
			urlObj.hostname === "youtube.com" ||
			urlObj.hostname === "youtu.be" ||
			urlObj.hostname === "youtube.app.goo.gl";

		if (!isYouTubeUrl) {
			return { isValid: false, error: "URL must be a valid YouTube URL." };
		}

		// 各種YouTube URL形式から動画IDを抽出
		let videoId: string | null = null;

		// 標準的なYouTube URL (youtube.com/watch?v=VIDEO_ID)
		if (urlObj.pathname === "/watch" && urlObj.searchParams.has("v")) {
			videoId = urlObj.searchParams.get("v");
		}
		// 短縮URL (youtu.be/VIDEO_ID)
		else if (urlObj.hostname === "youtu.be") {
			videoId = urlObj.pathname.substring(1); // 先頭の '/' を除去
		}
		// ライブ配信URL (youtube.com/live/VIDEO_ID)
		else if (urlObj.pathname.startsWith("/live/")) {
			videoId = urlObj.pathname.split("/")[2];
		}
		// 埋め込み形式 (youtube.com/embed/VIDEO_ID)
		else if (urlObj.pathname.startsWith("/embed/")) {
			videoId = urlObj.pathname.split("/")[2];
		}
		// モバイルアプリ共有 (youtube.app.goo.gl/VIDEO_ID)
		else if (urlObj.hostname === "youtube.app.goo.gl") {
			// このケースでは完全なURLに変換が必要な場合もある
			// ここでは単純にパスの最後の部分を取得
			const pathParts = urlObj.pathname.split("/").filter(Boolean);
			if (pathParts.length > 0) {
				videoId = pathParts[pathParts.length - 1];
			}
		}

		if (!videoId) {
			return {
				isValid: false,
				error: "Could not extract video ID from the URL.",
			};
		}

		// 動画IDの形式を検証（一般的なYouTube動画IDの形式：英数字、ハイフン、アンダースコア、11文字程度）
		const videoIdPattern = /^[A-Za-z0-9_-]{10,12}$/;
		if (!videoIdPattern.test(videoId)) {
			return { isValid: false, error: "Invalid YouTube video ID format." };
		}

		// サニタイズ処理（念のため再度チェック）
		videoId = videoId.replace(/[^A-Za-z0-9_-]/g, "");

		return { isValid: true, videoId };
	} catch (error) {
		return { isValid: false, error: "Invalid URL format." };
	}
}

/**
 * YouTube Live URL設定コンポーネント
 * @returns {JSX.Element} コンポーネント
 */
export default function YouTubeLinkConfig() {
	const [youtube_url, set_youtube_url] = useState("");
	const [is_saving, set_is_saving] = useState(false);

	/**
	 * YouTube URLを検証・保存する関数
	 */
	const handle_set_youtube_link = async () => {
		// URLの検証と動画ID抽出
		const validation_result = validateAndExtractYouTubeVideoId(youtube_url);

		if (!validation_result.isValid) {
			toast.error("Input Error", { description: validation_result.error });
			return;
		}

		set_is_saving(true);

		try {
			// Rustバックエンドに動画IDを保存
			await invoke("set_youtube_video_id", {
				videoId: validation_result.videoId,
			});
			console.log("YouTube video ID sent to backend.");

			// 成功トースト表示
			toast.success("Saved", {
				description: "YouTube Live URL has been validated and set.",
			});
		} catch (error) {
			// エラーハンドリング
			console.error("YouTube URLの設定に失敗しました:", error);
			const error_message =
				error instanceof Error
					? error.message
					: typeof error === "string"
						? error
						: "不明なエラーが発生しました。";
			toast.error("Save Error", {
				description: `Failed to set YouTube URL: ${error_message}`,
			});
		} finally {
			set_is_saving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>YouTube Live URL Configuration</CardTitle>
				<CardDescription>
					Set your YouTube Live URL. This video will be embedded in the viewer
					page.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="youtube-url">YouTube Live URL</Label>
					<div className="flex space-x-2">
						<Input
							id="youtube-url"
							placeholder="https://www.youtube.com/live/..."
							value={youtube_url}
							onChange={(e) => set_youtube_url(e.target.value)}
						/>
						<Button onClick={handle_set_youtube_link} disabled={is_saving}>
							<Save className="mr-2 h-4 w-4" />
							Validate & Set URL
						</Button>
					</div>
				</div>
				<p className="text-sm text-muted-foreground">
					Note: This setting is temporary and will be reset when the app is
					restarted.
				</p>
			</CardContent>
		</Card>
	);
}
