"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	AlertTriangle,
	Check,
	ClipboardCopy,
	Info,
	Loader2,
} from "lucide-react";
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
const WALLET_NOT_SET_ERROR =
	"Wallet address is not set. Please configure it first.";

/**
 * URL表示コンポーネント
 * Rustバックエンドから取得した情報をもとにURLを生成・表示します。
 */
export default function UrlDisplay() {
	const [obsCopied, setObsCopied] = useState(false);
	const [viewerCopied, setViewerCopied] = useState(false);
	const [streamerInfo, setStreamerInfo] = useState<StreamerInfo | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [needsConfiguration, setNeedsConfiguration] = useState(false);

	/**
	 * バックエンドから配信者情報を取得する関数
	 */
	const fetch_streamer_info = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		setNeedsConfiguration(false);
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
			if (error_message === WALLET_NOT_SET_ERROR) {
				setNeedsConfiguration(true);
				setError(null);
			} else {
				setError(`配信者情報の取得中にエラーが発生しました: ${error_message}`);
				setNeedsConfiguration(false);
			}
			setStreamerInfo(null);
		} finally {
			setIsLoading(false);
		}
	}, []);

	/**
	 * コンポーネントマウント時に情報を取得
	 * TODO: サーバー状態変更時にも再取得する仕組み
	 */
	useEffect(() => {
		fetch_streamer_info();

		// --- ウォレットアドレス更新イベントをリッスン --- ★★★
		const unlisten_wallet = listen<void>("wallet_address_updated", (event) => {
			console.log("Received wallet_address_updated event:", event);
			toast.info("ウォレットアドレスが更新されました。URL情報を再取得します。");
			fetch_streamer_info(); // イベントを受け取ったら再取得
		});

		// --- サーバー状態更新イベントをリッスン --- ★★★
		const unlisten_server = listen<boolean>(
			"server_status_updated",
			(event) => {
				console.log("Received server_status_updated event:", event);
				const is_running = event.payload;

				if (is_running) {
					toast.info("サーバーが起動しました。URL情報を再取得します。");
				} else {
					toast.info("サーバーが停止しました。URL情報をクリアします。");
				}

				// サーバー状態に関わらず情報を更新（起動中なら新情報取得、停止中ならクリア）
				fetch_streamer_info();
			},
		);

		// クリーンアップ関数
		return () => {
			unlisten_wallet.then((unlistenFn) => unlistenFn());
			unlisten_server.then((unlistenFn) => unlistenFn());
		};
	}, [fetch_streamer_info]);

	// --- URL生成ロジック ---
	let obs_url = "";
	let viewer_url = "";

	if (streamerInfo) {
		const { ws_url, wallet_address } = streamerInfo;
		try {
			const encodedWsUrl = encodeURIComponent(ws_url);
			const encodedWalletAddress = encodeURIComponent(wallet_address);

			// OBS URL (現状ウォレットアドレスのみ使用)
			obs_url = `${OBS_OVERLAY_BASE_URL}?walletAddress=${encodedWalletAddress}`;

			// 視聴者 URL
			viewer_url = `${VIEWER_APP_BASE_URL}?wsUrl=${encodedWsUrl}&streamerAddress=${encodedWalletAddress}`;
		} catch (encodeError) {
			console.error("Failed to encode URL parameters:", encodeError);
			setError("URLパラメータのエンコードに失敗しました。");
			setStreamerInfo(null);
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
				{error && !isLoading && (
					<div className="flex items-center text-red-600 bg-red-100 p-3 rounded-md">
						<AlertTriangle className="h-5 w-5 mr-2" />
						<p className="text-sm font-medium">{error}</p>
					</div>
				)}
				{needsConfiguration && !isLoading && !error && (
					<div className="flex items-center text-blue-600 bg-blue-100 p-3 rounded-md">
						<Info className="h-5 w-5 mr-2" />
						<p className="text-sm font-medium">
							ウォレットアドレスが設定されていません。上の設定欄から入力・保存してください。
						</p>
					</div>
				)}
				{!isLoading && !error && !needsConfiguration && streamerInfo && (
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
									disabled={!streamerInfo}
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
									disabled={!streamerInfo}
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
