"use client";

/**
 * WebSocketメッセージ送信コンポーネント
 *
 * WebSocket経由でメッセージを送信するためのフォームコンポーネントです。
 * 通常のチャットメッセージとスーパーチャットメッセージの両方に対応しています。
 *
 * @module components/websocket/WebSocketMessage
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWebSocketMessage } from "@/hooks/useWebSocketMessage";
import type { SuperchatData } from "@/lib/types/websocket";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type React from "react";
import { useState } from "react";

/**
 * スーパーチャットの金額オプション
 */
const AMOUNT_OPTIONS = [
	{ value: 0, label: "スパチャなし" },
	{ value: 1, label: "1 SUI" },
	{ value: 3, label: "3 SUI" },
	{ value: 5, label: "5 SUI" },
	{ value: 10, label: "10 SUI" },
];

/**
 * テスト用のトランザクションハッシュを生成する関数
 */
const generateTestTxHash = () => {
	return `0x${Array.from({ length: 64 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("")}`;
};

/**
 * WebSocketメッセージ送信コンポーネントのプロパティ
 */
interface WebSocketMessageProps {
	/**
	 * 送信者のウォレットアドレス
	 * @default "0x1234...abcd"（テスト用）
	 */
	walletAddress?: string;
}

/**
 * WebSocketメッセージ送信コンポーネント
 *
 * @param {WebSocketMessageProps} props - コンポーネントプロパティ
 * @returns {JSX.Element} WebSocketメッセージ送信コンポーネント
 */
export function WebSocketMessage({
	walletAddress = "0x1234567890abcdef1234567890abcdef12345678",
}: WebSocketMessageProps): React.ReactElement {
	// フォーム状態
	const [displayName, setDisplayName] = useState("");
	const [message, setMessage] = useState("");
	const [amount, setAmount] = useState<number>(0);

	// 送信状態
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [success, setSuccess] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// WebSocketメッセージフック
	const { canSend, sendChat, sendSuperchat } = useWebSocketMessage();

	/**
	 * フォーム送信ハンドラ
	 */
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!canSend) {
			setError(
				"WebSocketが接続されていません。WebSocket接続状態を確認してください。",
			);
			return;
		}

		if (!displayName.trim()) {
			setError("表示名を入力してください。");
			return;
		}

		setIsSubmitting(true);
		setError(null);
		setSuccess(false);

		try {
			let result = false;

			// スパチャの有無によって処理を分岐
			if (amount > 0) {
				// スパチャ付きメッセージ
				const superchatData: SuperchatData = {
					amount,
					tx_hash: generateTestTxHash(),
					wallet_address: walletAddress,
				};

				// 実際のアプリでは、ここでSUI送金処理を行う
				// トランザクションが成功した後にメッセージを送信

				result = sendSuperchat(displayName, message, superchatData);
			} else {
				// 通常のチャットメッセージ
				result = sendChat(displayName, message);
			}

			if (result) {
				setSuccess(true);
				setDisplayName("");
				setMessage("");
				setAmount(0);
			} else {
				setError("メッセージの送信に失敗しました。");
			}
		} catch (err) {
			setError(
				`エラーが発生しました: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="p-4 border rounded-lg shadow-sm dark:border-gray-700">
			<h3 className="text-lg font-medium mb-3">WebSocketメッセージ送信</h3>

			{!canSend && (
				<Alert
					variant="default"
					className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/50"
				>
					<AlertCircle className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />
					<AlertTitle>接続が必要です</AlertTitle>
					<AlertDescription>
						WebSocketに接続していません。WebSocket接続状態から接続してください。
					</AlertDescription>
				</Alert>
			)}

			{error && (
				<Alert variant="destructive" className="mb-4">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{success && (
				<Alert className="mb-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/50">
					<CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
					<AlertDescription className="text-green-700 dark:text-green-300">
						メッセージが正常に送信されました。
					</AlertDescription>
				</Alert>
			)}

			<form onSubmit={handleSubmit} className="space-y-3">
				<div className="space-y-1.5">
					<Label htmlFor="displayName">表示名</Label>
					<Input
						id="displayName"
						value={displayName}
						onChange={(e) => setDisplayName(e.target.value)}
						placeholder="表示名を入力"
						disabled={isSubmitting}
						required
						className="dark:bg-gray-800"
					/>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="message">メッセージ</Label>
					<Textarea
						id="message"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						placeholder="メッセージを入力"
						disabled={isSubmitting}
						className="min-h-[80px] max-h-[150px] dark:bg-gray-800"
					/>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="amount">スーパーチャット金額</Label>
					<Select
						value={amount.toString()}
						onValueChange={(value) => setAmount(Number(value))}
						disabled={isSubmitting}
					>
						<SelectTrigger id="amount" className="dark:bg-gray-800">
							<SelectValue placeholder="金額を選択" />
						</SelectTrigger>
						<SelectContent>
							{AMOUNT_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value.toString()}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{amount > 0 && (
						<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
							テスト用: 実際のSUI送金は行われません。送金先アドレス:{" "}
							{walletAddress}
						</p>
					)}
				</div>

				<Button
					type="submit"
					disabled={isSubmitting || !canSend}
					className="w-full mt-3"
				>
					{isSubmitting ? "送信中..." : "送信"}
				</Button>
			</form>
		</div>
	);
}
