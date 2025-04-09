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
import { useEffect, useState } from "react";
import { toast } from "sonner";

// ローカルストレージのキー
const WALLET_ADDRESS_KEY = "suiperchat_wallet_address";
const DEFAULT_WALLET_PLACEHOLDER = "YOUR_WALLET_ADDRESS";
const SERVER_PORT = 3001; // 仮定のポート番号、サーバー状態から取得する方が望ましい

/**
 * URL表示コンポーネント
 * @returns {JSX.Element} コンポーネント
 */
export default function UrlDisplay() {
	const [obsCopied, setObsCopied] = useState(false);
	const [viewerCopied, setViewerCopied] = useState(false);
	const [walletAddress, setWalletAddress] = useState(
		DEFAULT_WALLET_PLACEHOLDER,
	);

	/**
	 * コンポーネントマウント時にローカルストレージからウォレットアドレスを読み込む
	 */
	useEffect(() => {
		const saved_address = localStorage.getItem(WALLET_ADDRESS_KEY);
		if (saved_address) {
			setWalletAddress(saved_address);
		}
	}, []);

	// URL生成
	const obs_url = `http://localhost:${SERVER_PORT}/overlay?walletAddress=${walletAddress}`;
	const viewer_url = `https://suiperchat.app/chat?streamer=${walletAddress}`;

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

	// ウォレットアドレスが設定されているかどうかをチェック
	const isWalletConfigured = walletAddress !== DEFAULT_WALLET_PLACEHOLDER;

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
							disabled={!isWalletConfigured}
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
							disabled={!isWalletConfigured}
						>
							{viewerCopied ? (
								<Check className="h-4 w-4" />
							) : (
								<ClipboardCopy className="h-4 w-4" />
							)}
						</Button>
					</div>
				</div>
				{!isWalletConfigured && (
					<p className="text-sm text-red-500">
						ウォレットアドレスが設定されていません。上部のウォレットアドレス設定から設定してください。
					</p>
				)}
				<p className="text-sm text-muted-foreground">
					注意:
					これらのURLを使用して、OBSでスーパーチャット表示を設定したり、視聴者にリンクを共有したりできます。
				</p>
			</CardContent>
		</Card>
	);
}
