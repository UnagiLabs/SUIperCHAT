"use client";

/**
 * WebSocketメッセージ表示コンポーネント
 *
 * WebSocketで受信したメッセージを表示するコンポーネントです。
 * 通常のチャットメッセージとスーパーチャットメッセージの両方に対応しています。
 *
 * @module components/websocket/WebSocketMessageDisplay
 */

import { useWebSocket } from "@/components/providers/WebSocketProvider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	type ChatMessage,
	MessageType,
	type SuperchatMessage,
} from "@/lib/types/websocket";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import type React from "react";

/**
 * スパチャ金額に応じた背景色を取得する関数
 *
 * @param {number} amount - スーパーチャット金額
 * @returns {string} 背景色のCSSクラス
 */
const getSuperchatBgColor = (amount: number): string => {
	if (amount >= 10)
		return "bg-red-100 border-red-300 dark:bg-red-900/20 dark:border-red-900/30";
	if (amount >= 5)
		return "bg-orange-100 border-orange-300 dark:bg-orange-900/20 dark:border-orange-900/30";
	if (amount >= 3)
		return "bg-yellow-100 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-900/30";
	return "bg-blue-100 border-blue-300 dark:bg-blue-900/20 dark:border-blue-900/30";
};

/**
 * WebSocketメッセージ表示コンポーネント
 *
 * @returns {JSX.Element} WebSocketメッセージ表示コンポーネント
 */
export function WebSocketMessageDisplay(): React.ReactElement {
	const {
		state: { messages },
	} = useWebSocket();

	return (
		<div className="p-4 border rounded-lg shadow-sm dark:border-gray-700">
			<h3 className="text-lg font-medium mb-3">メッセージ履歴</h3>

			<ScrollArea className="h-[600px] overflow-hidden">
				{messages.length === 0 ? (
					<div className="flex items-center justify-center h-[500px] text-gray-400 dark:text-gray-500">
						メッセージはまだありません
					</div>
				) : (
					<div className="space-y-3 pb-4">
						{messages.map((msg) => (
							<MessageItem key={msg.id} message={msg} />
						))}
					</div>
				)}
			</ScrollArea>
		</div>
	);
}

/**
 * メッセージアイテムのプロパティ
 */
interface MessageItemProps {
	message: ChatMessage | SuperchatMessage;
}

/**
 * メッセージアイテムコンポーネント
 *
 * @param {MessageItemProps} props - コンポーネントプロパティ
 * @returns {JSX.Element} メッセージアイテムコンポーネント
 */
function MessageItem({ message }: MessageItemProps): React.ReactElement {
	const isSuperchat = message.type === MessageType.SUPERCHAT;
	const superchatMsg = message as SuperchatMessage;

	// 表示時間の計算
	const timeAgo = formatDistanceToNow(new Date(message.timestamp), {
		addSuffix: true,
		locale: ja,
	});

	return (
		<div
			className={`p-3 border rounded-md ${
				isSuperchat
					? getSuperchatBgColor((message as SuperchatMessage).superchat.amount)
					: "bg-white dark:bg-gray-800 dark:border-gray-700"
			}`}
		>
			<div className="flex justify-between items-start mb-1">
				<div className="font-medium">{message.display_name}</div>
				<div className="text-xs text-gray-500 dark:text-gray-400">
					{timeAgo}
				</div>
			</div>

			{isSuperchat && (
				<div className="flex items-center mb-2">
					<Badge variant="secondary" className="mr-2">
						{superchatMsg.superchat.amount} SUI
					</Badge>
					<span className="text-xs text-gray-500 dark:text-gray-400 truncate">
						TX: {superchatMsg.superchat.tx_hash.slice(0, 10)}...
					</span>
				</div>
			)}

			<div className="text-sm">
				{message.message || (
					<span className="text-gray-400 dark:text-gray-500">
						(メッセージなし)
					</span>
				)}
			</div>
		</div>
	);
}
