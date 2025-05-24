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
 * メッセージを省略して表示する関数（長い場合のみ省略）
 * @param message - 元のメッセージ
 * @param maxLength - 最大長さ（デフォルト500文字）
 * @returns 必要に応じて省略されたメッセージ
 */
function truncateMessage(message: string, maxLength = 500): string {
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
		<div className="w-full overflow-auto h-full">
			<Table className="table-fixed w-full">
				<TableHeader className="sticky top-0 bg-background z-10">
					<TableRow>
						<TableHead className="w-[120px] text-xs">タイムスタンプ</TableHead>
						<TableHead className="w-[100px] text-xs">名前</TableHead>
						<TableHead className="min-w-0 text-xs">メッセージ</TableHead>
						<TableHead className="w-[70px] text-right text-xs">金額</TableHead>
						<TableHead className="w-[55px] text-xs">コイン</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoading ? (
						<TableRow>
							<TableCell colSpan={5} className="text-center py-8 text-xs">
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
								<TableCell className="font-mono text-xs py-2 align-top">
									{formatTimestamp(comment.timestamp)}
								</TableCell>
								<TableCell className="font-medium text-xs py-2 align-top">
									<div className="truncate" title={comment.name}>
										{comment.name}
									</div>
								</TableCell>
								<TableCell className="text-xs py-2 align-top min-w-0">
									<div
										className="max-h-[120px] overflow-y-auto whitespace-pre-wrap break-words overflow-wrap-anywhere"
										title={comment.message}
									>
										{truncateMessage(comment.message)}
									</div>
								</TableCell>
								<TableCell className="text-right text-xs py-2 align-top">
									{comment.superchat?.amount ? (
										<Badge variant="success" className="text-xs py-0 px-1">
											{comment.superchat.amount}
										</Badge>
									) : (
										"-"
									)}
								</TableCell>
								<TableCell className="text-xs py-2 align-top">
									{comment.superchat?.coin ? (
										<div className="flex items-center gap-1">
											<Coins className="h-3 w-3 flex-shrink-0" />
											<span className="truncate">{comment.superchat.coin}</span>
										</div>
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
