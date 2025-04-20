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
	obs_url: string;
	wallet_address: string;
}

/**
 * バックエンドから送信されるServerStatusイベントのペイロード型
 */
interface ServerStatusPayload {
	is_running: boolean;
	obs_url?: string | null;
	ws_url?: string | null;
}

// --- 定数 ---
// 環境変数から視聴者アプリのベースURLを取得、なければ本番URLをフォールバック
const VIEWER_APP_BASE_URL =
	process.env.NEXT_PUBLIC_VIEWER_APP_BASE_URL || "https://suiperchat.app/chat";
// OBSオーバーレイURLはwebsocketサーバーのURLから動的に生成するようになりました
// const OBS_OVERLAY_BASE_URL = "http://localhost:3001/overlay";
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
	// OBS URLとWS URLを状態として追加
	const [obsUrl, setObsUrl] = useState("");
	const [wsUrl, setWsUrl] = useState("");

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
			} else if (
				error_message.includes("WebSocket server host is not available") ||
				error_message.includes("server not running")
			) {
				// サーバーが起動していない場合はエラーではなく、情報表示として扱う
				setError(null);
				setNeedsConfiguration(false);
				console.log("Server is not running, will display appropriate message");
			} else {
				setError(`Error while fetching streamer information: ${error_message}`);
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
			toast.info(
				"Wallet address has been updated. Refreshing URL information.",
			);
			fetch_streamer_info(); // イベントを受け取ったら再取得
		});

		// --- サーバー状態更新イベントをリッスン --- ★★★
		const unlisten_server = listen<ServerStatusPayload>(
			"server_status_updated",
			(event) => {
				console.log("Received server_status_updated event:", event);
				const { is_running, obs_url, ws_url } = event.payload;

				if (is_running) {
					toast.info("Server has started. Refreshing URL information.");
					// バックエンドから直接URLを設定
					if (obs_url) setObsUrl(obs_url);
					if (ws_url) setWsUrl(ws_url);
				} else {
					toast.info("Server has stopped. Clearing URL information.");
					// サーバー停止時はURLをクリア
					setObsUrl("");
					setWsUrl("");
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
	let obs_url = obsUrl; // 状態から直接取得（server_status_updatedイベントから）
	let viewer_url = "";

	if (streamerInfo) {
		const {
			ws_url,
			obs_url: streamerInfoObsUrl,
			wallet_address,
		} = streamerInfo;
		try {
			const encodedWalletAddress = encodeURIComponent(wallet_address);

			// OBS URL - バックエンドから受け取ったものを優先使用
			if (!obs_url) {
				// server_status_updatedイベントからOBS URLが設定されていない場合
				if (streamerInfoObsUrl) {
					// get_streamer_infoから返されたOBS URLを使用
					obs_url = streamerInfoObsUrl;
				} else if (ws_url) {
					// どちらも設定されていない場合は、WebSocketのURLからOBS URLを生成（旧ロジック）
					// この部分は、古いバージョンとの互換性のために残しています
					const wsUrlObj = new URL(ws_url);
					const httpProtocol =
						wsUrlObj.protocol === "wss:" ? "https:" : "http:";
					const host = wsUrlObj.hostname;
					// 動的にポート番号を取得するためのロジックを実装（現在は使用されない）
					const obsPort = "8081"; // OBSサーバーは常に8081ポートで起動する
					obs_url = `${httpProtocol}//${host}:${obsPort}/obs/`;
				} else {
					// フォールバック（古い方式）
					obs_url = `http://localhost:3001/overlay?walletAddress=${encodedWalletAddress}`;
				}
			}

			// 視聴者 URL - こちらもwsUrlを状態から直接取得可能
			const wsUrlToUse = wsUrl || ws_url;
			viewer_url = `${VIEWER_APP_BASE_URL}?wsUrl=${encodeURIComponent(wsUrlToUse)}&streamerAddress=${encodedWalletAddress}`;
		} catch (encodeError) {
			console.error("Failed to encode URL parameters:", encodeError);
			setError("Failed to encode URL parameters.");
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
			toast("Copied", {
				description: "URL has been copied to clipboard.",
			});
			// アイコンを元に戻すタイマー
			setTimeout(() => {
				setObsCopied(false);
				setViewerCopied(false);
			}, 2000);
		} catch (err) {
			console.error("クリップボードへのコピーに失敗しました:", err);
			toast.error("Copy Failed", {
				description: "Failed to copy to clipboard.",
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
						<span className="ml-2 text-muted-foreground">
							Loading information...
						</span>
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
							Wallet address is not set. Please enter and save it in the
							settings above.
						</p>
					</div>
				)}
				{!isLoading && !error && !needsConfiguration && !streamerInfo && (
					<div className="flex items-center text-amber-600 bg-amber-50 p-3 rounded-md">
						<Info className="h-5 w-5 mr-2" />
						<p className="text-sm font-medium">
							Server is not running. Please start it from the server control
							above.
						</p>
					</div>
				)}
				{!isLoading && !error && !needsConfiguration && streamerInfo && (
					<>
						<div className="space-y-2">
							<Label htmlFor="obs-url">OBS Browser Source URL</Label>
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
							<Label htmlFor="viewer-url">Viewer Share Link</Label>
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
							Note: You can use these URLs to set up superchat display in OBS
							and share links with viewers.
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}
