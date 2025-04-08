"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ClipboardCopy } from "lucide-react";
/**
 * URL表示コンポーネント
 *
 * OBS用URLと視聴者用リンクを表示し、クリップボードへのコピー機能を提供します。
 *
 * @module components/features/dashboard/UrlDisplay
 * @returns {JSX.Element} URL表示コンポーネント
 */
import { useState } from "react";
import { toast } from "sonner";

// TODO: 実際のウォレットアドレスやポートを取得するロジックが必要
const WALLET_ADDRESS_PLACEHOLDER = "YOUR_WALLET_ADDRESS_PLACEHOLDER";
const SERVER_PORT = 3001; // 仮定のポート番号、サーバー状態から取得する方が望ましい

/**
 * URL表示コンポーネント
 * @returns {JSX.Element} コンポーネント
 */
export default function UrlDisplay() {
	const [obsCopied, setObsCopied] = useState(false);
	const [viewerCopied, setViewerCopied] = useState(false);

	// TODO: サーバーの状態に応じてポート番号を動的に設定する
	// TODO: 設定などからウォレットアドレスを取得する
	const obs_url = `http://localhost:${SERVER_PORT}/overlay?walletAddress=${WALLET_ADDRESS_PLACEHOLDER}`;
	const viewer_url = `https://suiperchat.app/chat?streamer=${WALLET_ADDRESS_PLACEHOLDER}`;

	/**
	 * テキストをクリップボードにコピーする関数
	 * @param {string} text - コピーするテキスト
	 * @param {() => void} on_success - 成功時のコールバック
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
					上記URLのウォレットアドレスとポート番号は現在プレースホルダーです。実際の値を取得・設定する機能が必要です。
				</p>
			</CardContent>
		</Card>
	);
}
