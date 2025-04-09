"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Check, ClipboardCopy, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// --- 型定義 ---
interface StreamerInfo {
	ws_url: string;
	wallet_address: string;
}

// --- 定数 ---
// 環境変数から視聴者アプリのベースURLを取得、なければ本番URLをフォールバック
const VIEWER_APP_BASE_URL =
	process.env.NEXT_PUBLIC_VIEWER_APP_BASE_URL || "https://suiperchat.app/chat";
// TODO: OBSオーバーレイのポートも動的に取得・設定可能にする
const OBS_OVERLAY_BASE_URL = "http://localhost:3001/overlay";

/**
 * URL表示コンポーネント
 * Rustバックエンドから取得した情報をもとにURLを生成・表示します。
 * @returns {JSX.Element} コンポーネント
 */
export default function UrlDisplay() {
	const [obsCopied, setObsCopied] = useState(false);
	const [viewerCopied, setViewerCopied] = useState(false);
	const [streamerInfo, setStreamerInfo] = useState<StreamerInfo | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	/**
	 * バックエンドから配信者情報を取得する関数
	 */
	const fetch_streamer_info = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const info = await invoke<StreamerInfo>("get_streamer_info");
			setStreamerInfo(info);
			console.log("Fetched streamer info:", info);
		} catch (err) {
			console.error("Failed to fetch streamer info:", err);
			const error_message =
				err instanceof Error
					? err.message
					: typeof err === "string"
						? err
						: "不明なエラーが発生しました。";
			setError(`配信者情報の取得に失敗: ${error_message}`);
			setStreamerInfo(null); // エラー時は情報をクリア
		} finally {
			setIsLoading(false);
		}
	}, []);

	/**
	 * コンポーネントマウント時に情報を取得
	 * TODO: サーバー状態やウォレットアドレス変更時にも再取得する仕組み
	 */
	useEffect(() => {
		fetch_streamer_info();
	}, [fetch_streamer_info]);

	// --- URL生成ロジック ---
	let obs_url = "";
	let viewer_url = "";
	let isDataAvailable = false;

	if (streamerInfo) {
		const { ws_url, wallet_address } = streamerInfo;
		try {
			const encodedWsUrl = encodeURIComponent(ws_url);
			const encodedWalletAddress = encodeURIComponent(wallet_address);

			// OBS URL (現状ウォレットアドレスのみ使用)
			obs_url = `${OBS_OVERLAY_BASE_URL}?walletAddress=${encodedWalletAddress}`;

			// 視聴者 URL
			viewer_url = `${VIEWER_APP_BASE_URL}?wsUrl=${encodedWsUrl}&streamerAddress=${encodedWalletAddress}`;

			isDataAvailable = true;
		} catch (encodeError) {
			console.error("Failed to encode URL parameters:", encodeError);
			setError("URLパラメータのエンコードに失敗しました。");
			isDataAvailable = false;
		}
	}

	/**
	 * テキストをクリップボードにコピーする関数
	 */
	const copy_to_clipboard = async (text: string, on_success: () => void) => {
		try {
			await navigator.clipboard.writeText(text);
			on_success();
			toast("コピーしました", {
				description: "URLをクリップボードにコピーしました。",
			});
			// アイコンを元に戻すタイマー
			setTimeout(() => {
				setObsCopied(false);
				setViewerCopied(false);
			}, 2000);
		} catch (err) {
			console.error("クリップボードへのコピーに失敗しました:", err);
			toast.error("コピー失敗", {
				description: "クリップボードへのコピーに失敗しました。",
			});
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>URL</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading && (
					<div className="flex items-center justify-center py-4">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						<span className="ml-2 text-muted-foreground">情報を取得中...</span>
					</div>
				)}
				{error && (
					<div className="flex items-center text-red-600 bg-red-100 p-3 rounded-md">
						<AlertTriangle className="h-5 w-5 mr-2" />
						<p className="text-sm font-medium">{error}</p>
					</div>
				)}
				{!isLoading && !error && (
					<>
						<div className="space-y-2">
							<Label htmlFor="obs-url">OBSブラウザソース用URL</Label>
							<div className="flex space-x-2">
								<Input id="obs-url" value={obs_url} readOnly />
								<Button
									variant="outline"
									size="icon"
									onClick={() =>
										copy_to_clipboard(obs_url, () => setObsCopied(true))
									}
									disabled={!isDataAvailable}
								>
									{obsCopied ? (
										<Check className="h-4 w-4" />
									) : (
										<ClipboardCopy className="h-4 w-4" />
									)}
								</Button>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="viewer-url">視聴者共有用リンク</Label>
							<div className="flex space-x-2">
								<Input id="viewer-url" value={viewer_url} readOnly />
								<Button
									variant="outline"
									size="icon"
									onClick={() =>
										copy_to_clipboard(viewer_url, () => setViewerCopied(true))
									}
									disabled={!isDataAvailable}
								>
									{viewerCopied ? (
										<Check className="h-4 w-4" />
									) : (
										<ClipboardCopy className="h-4 w-4" />
									)}
								</Button>
							</div>
						</div>
						<p className="text-sm text-muted-foreground">
							注意:
							これらのURLを使用して、OBSでスーパーチャット表示を設定したり、視聴者にリンクを共有したりできます。
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}
