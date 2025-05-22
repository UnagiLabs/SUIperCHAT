/**
 * 配信者設定コンポーネント
 *
 * ウォレットアドレスとYouTube LiveのURLを一つのカードにまとめて設定するためのフォームを提供します。
 * ウォレットアドレスはローカルストレージに保存され、YouTube URLはセッション中のみ保持されます。
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
import { useEffect, useState } from "react";
import { toast } from "sonner";

// ローカルストレージのキー
const WALLET_ADDRESS_KEY = "suiperchat_wallet_address";

/**
 * SUIウォレットアドレスの形式を検証する関数
 * @param {string} address - 検証するアドレス文字列
 * @returns {string | null} - エラーメッセージ (無効な場合) または null (有効な場合)
 */
function validate_sui_address(address: string): string | null {
	const trimmed_address = address.trim();
	if (!trimmed_address) {
		return "Please enter a wallet address.";
	}
	if (!trimmed_address.startsWith("0x")) {
		return "Invalid SUI wallet address: must start with '0x'.";
	}
	if (trimmed_address.length !== 66) {
		return `Invalid SUI wallet address: must be 66 characters long (currently ${trimmed_address.length} characters).`;
	}
	// "0x" 以降が16進数文字のみかチェック (正規表現を使用)
	const hex_pattern = /^[a-fA-F0-9]+$/;
	if (!hex_pattern.test(trimmed_address.substring(2))) {
		return "Invalid SUI wallet address: contains non-hexadecimal characters after '0x'.";
	}
	return null; // 有効
}

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
 * 配信者設定コンポーネント
 * @returns {JSX.Element} コンポーネント
 */
export default function StreamerConfig() {
	const [wallet_address, set_wallet_address] = useState("");
	const [youtube_url, set_youtube_url] = useState("");
	const [is_saving, set_is_saving] = useState(false);

	/**
	 * コンポーネントマウント時にローカルストレージから情報を読み込む
	 */
	useEffect(() => {
		const saved_address = localStorage.getItem(WALLET_ADDRESS_KEY);
		if (saved_address) {
			set_wallet_address(saved_address);
		}
	}, []);

	/**
	 * 設定を保存する関数
	 */
	const handle_save_config = async () => {
		// --- ウォレットアドレスのバリデーション ---
		const wallet_validation_error = validate_sui_address(wallet_address);
		if (wallet_validation_error) {
			toast.error("Wallet Address Error", {
				description: wallet_validation_error,
			});
			return;
		}

		// --- YouTube URLのバリデーションと動画ID抽出 ---
		const youtube_validation_result =
			validateAndExtractYouTubeVideoId(youtube_url);
		if (!youtube_validation_result.isValid) {
			toast.error("YouTube URL Error", {
				description: youtube_validation_result.error,
			});
			return;
		}

		set_is_saving(true);

		try {
			// ウォレットアドレスを保存
			await invoke("set_wallet_address", { address: wallet_address.trim() });
			console.log("Wallet address sent to backend.");

			// ローカルストレージにも保存
			localStorage.setItem(WALLET_ADDRESS_KEY, wallet_address);

			// YouTube動画IDを保存
			await invoke("set_youtube_video_id", {
				videoId: youtube_validation_result.videoId,
			});
			console.log("YouTube video ID sent to backend.");

			// 成功トースト表示
			toast.success("Saved", {
				description: "Streamer configuration has been saved.",
			});
		} catch (error) {
			// エラーハンドリング
			console.error("設定の保存に失敗しました:", error);
			const error_message =
				error instanceof Error
					? error.message
					: typeof error === "string"
						? error
						: "不明なエラーが発生しました。";
			toast.error("Save Error", {
				description: `Failed to save configuration: ${error_message}`,
			});
		} finally {
			set_is_saving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Streamer Configuration</CardTitle>
				<CardDescription>
					Set your SUI wallet address and YouTube Live URL. Both settings are
					required to start the server.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="wallet-address">SUI Wallet Address</Label>
					<Input
						id="wallet-address"
						placeholder="0x..."
						value={wallet_address}
						onChange={(e) => set_wallet_address(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						Superchats from viewers will be sent to this address.
					</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="youtube-url">YouTube Live URL</Label>
					<Input
						id="youtube-url"
						placeholder="https://www.youtube.com/live/..."
						value={youtube_url}
						onChange={(e) => set_youtube_url(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">
						This video will be embedded in the viewer page. Reset when app is
						restarted.
					</p>
				</div>

				<Button
					onClick={handle_save_config}
					disabled={is_saving}
					className="w-full"
				>
					<Save className="mr-2 h-4 w-4" />
					Save Configuration
				</Button>
			</CardContent>
		</Card>
	);
}
