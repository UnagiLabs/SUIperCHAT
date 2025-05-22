/**
 * コメント履歴を表形式で表示するコンポーネント
 *
 * 通常のコメントとスーパーチャットを視覚的に区別して表示します。
 * 表示件数が多い場合でもパフォーマンスを考慮した実装になっています。
 *
 * @component
 */

import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { FormattedComment } from "@/lib/types";
import { format } from "date-fns";
import { Coins } from "lucide-react";

interface CommentHistoryTableProps {
	/** 表示するコメントデータの配列 */
	comments: FormattedComment[];
	/** データロード中かどうかを示すフラグ */
	isLoading: boolean;
}

/**
 * タイムスタンプを読みやすい形式にフォーマットする関数
 * @param timestamp - Unixミリ秒のタイムスタンプ
 * @returns フォーマットされた日時文字列
 */
function formatTimestamp(timestamp: number): string {
	try {
		return format(new Date(timestamp), "yyyy/MM/dd HH:mm:ss");
	} catch (error) {
		console.error("タイムスタンプのフォーマットに失敗:", error);
		return "Invalid date";
	}
}

/**
 * メッセージを省略して表示する関数
 * @param message - 元のメッセージ
 * @param maxLength - 最大長さ（デフォルト100文字）
 * @returns 必要に応じて省略されたメッセージ
 */
function truncateMessage(message: string, maxLength = 100): string {
	if (message.length <= maxLength) return message;
	return `${message.substring(0, maxLength)}...`;
}

export default function CommentHistoryTable({
	comments,
	isLoading,
}: CommentHistoryTableProps) {
	// 表示するコメントがない場合
	if (!isLoading && (!comments || comments.length === 0)) {
		return (
			<div className="text-center py-8 text-muted-foreground">
				まだコメントはありません
			</div>
		);
	}

	return (
		<div className="w-full overflow-auto max-h-[calc(100vh-200px)]">
			<Table>
				<TableHeader className="sticky top-0 bg-background z-10">
					<TableRow>
						<TableHead className="w-[150px]">タイムスタンプ</TableHead>
						<TableHead className="w-[120px]">名前</TableHead>
						<TableHead>メッセージ</TableHead>
						<TableHead className="w-[80px] text-right">金額</TableHead>
						<TableHead className="w-[60px]">コイン</TableHead>
						<TableHead className="w-[80px]">Tx Hash</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoading ? (
						<TableRow>
							<TableCell colSpan={6} className="text-center py-4">
								読み込み中...
							</TableCell>
						</TableRow>
					) : (
						comments.map((comment) => (
							<TableRow
								key={comment.id}
								className={
									comment.message_type === "SUPERCHAT"
										? "bg-amber-50 dark:bg-amber-950/30"
										: ""
								}
							>
								<TableCell className="font-mono text-xs">
									{formatTimestamp(comment.timestamp)}
								</TableCell>
								<TableCell className="font-medium truncate max-w-[120px]">
									{comment.name}
								</TableCell>
								<TableCell className="whitespace-pre-wrap break-words">
									<div
										className="max-h-[100px] overflow-y-auto"
										title={comment.message}
									>
										{truncateMessage(comment.message)}
									</div>
								</TableCell>
								<TableCell className="text-right">
									{comment.superchat?.amount ? (
										<Badge variant="success">{comment.superchat.amount}</Badge>
									) : (
										"-"
									)}
								</TableCell>
								<TableCell>
									{comment.superchat?.coin ? (
										<div className="flex items-center gap-1">
											<Coins className="h-3 w-3" />
											<span>{comment.superchat.coin}</span>
										</div>
									) : (
										"-"
									)}
								</TableCell>
								<TableCell className="font-mono text-xs truncate max-w-[80px]">
									{comment.superchat?.tx_hash ? (
										<span title={comment.superchat.tx_hash}>
											{`${comment.superchat.tx_hash.substring(0, 6)}...`}
										</span>
									) : (
										"-"
									)}
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}
