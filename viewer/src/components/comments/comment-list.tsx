/**
 * コメント表示コンポーネント
 *
 * コメントとスーパーチャットを表示するためのコンポーネント。
 * スクロール可能なリスト形式でコメントを表示します。
 * 現時点ではWebSocket受信部分はダミー実装になっています。
 *
 * @remarks
 * - ScrollAreaコンポーネントを使用したスクロール可能なコメントリスト
 * - 一般コメントとスーパーチャットの視覚的な区別
 * - 自動スクロール機能
 *
 * @file コメント表示コンポーネントの実装
 */

"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
	type ChatMessage,
	MessageType,
	type SuperchatMessage,
} from "@/lib/types/websocket";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * コメントリストコンポーネントのプロパティ
 */
interface CommentListProps {
	/**
	 * コンポーネントのクラス名
	 */
	className?: string;

	/**
	 * 自動スクロールを有効にするかどうか
	 * @default true
	 */
	auto_scroll?: boolean;
}

/**
 * コメント表示コンポーネント
 *
 * @param props - コンポーネントのプロパティ
 * @returns コメントリストのJSXエレメント
 */
export function CommentList({
	className,
	auto_scroll = true,
}: CommentListProps) {
	// コメントデータの状態
	const [comments, set_comments] = useState<(ChatMessage | SuperchatMessage)[]>(
		[],
	);

	// 自動スクロールの参照
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const isAutoScrolling = useRef(auto_scroll);

	// モックデータでコメントを初期化（本番環境では削除）
	useEffect(() => {
		const mockComments: (ChatMessage | SuperchatMessage)[] = [
			{
				id: "1",
				type: MessageType.CHAT,
				display_name: "視聴者77",
				message: "これはテストコメントです。",
				timestamp: Date.now() - 25000,
			},
			{
				id: "2",
				type: MessageType.SUPERCHAT,
				display_name: "スーパーチャッター73",
				message: "応援メッセージ！",
				timestamp: Date.now() - 20000,
				superchat: {
					amount: 95,
					coin: "SUI",
					tx_hash: "0x123456789abcdef",
					wallet_address: "0xabcdef123456789",
				},
			},
			{
				id: "3",
				type: MessageType.SUPERCHAT,
				display_name: "スーパーチャッター10",
				message: "応援メッセージ！",
				timestamp: Date.now() - 15000,
				superchat: {
					amount: 1,
					coin: "SUI",
					tx_hash: "0xabcdef123456789",
					wallet_address: "0x123456789abcdef",
				},
			},
			{
				id: "4",
				type: MessageType.SUPERCHAT,
				display_name: "スーパーチャッター46",
				message: "応援メッセージ！",
				timestamp: Date.now() - 10000,
				superchat: {
					amount: 84,
					coin: "SUI",
					tx_hash: "0x987654321abcdef",
					wallet_address: "0xfedcba987654321",
				},
			},
			{
				id: "5",
				type: MessageType.CHAT,
				display_name: "視聴者12",
				message: "これはテストコメントです。",
				timestamp: Date.now() - 5000,
			},
			{
				id: "6",
				type: MessageType.CHAT,
				display_name: "視聴者21",
				message: "これはテストコメントです。",
				timestamp: Date.now() - 1000,
			},
		];

		set_comments(mockComments);
	}, []);

	/**
	 * WebSocketからコメントを受信する関数
	 * 注: この関数は現時点ではダミー実装です。実際のWebSocket実装は別途行います。
	 *
	 * @todo WebSocket接続を実装して実際のコメントを受信する
	 */
	const receive_comment = useCallback(
		(comment: ChatMessage | SuperchatMessage) => {
			// この関数は将来的にWebSocketから受信したコメントを処理します
			// WebSocketプロバイダーと連携する予定
			set_comments((prev) => [...prev, comment]);
		},
		[],
	);

	/**
	 * 擬似的にコメントを追加する関数（テスト用）
	 */
	const add_test_comment = useCallback(() => {
		const now = Date.now();
		const is_superchat = Math.random() > 0.7; // 30%の確率でスーパーチャット

		const new_comment: ChatMessage | SuperchatMessage = is_superchat
			? {
					id: `sc-${now}`,
					type: MessageType.SUPERCHAT,
					display_name: `スーパーチャッター${Math.floor(Math.random() * 100)}`,
					message: `応援メッセージ！${now}`,
					timestamp: now,
					superchat: {
						amount: Math.floor(Math.random() * 100) + 1,
						coin: "SUI",
						tx_hash: `0x${now.toString(16)}`,
						wallet_address: `0x${Math.random().toString(16).substring(2)}`,
					},
				}
			: {
					id: `chat-${now}`,
					type: MessageType.CHAT,
					display_name: `視聴者${Math.floor(Math.random() * 100)}`,
					message: `これはテストコメントです。${now}`,
					timestamp: now,
				};

		receive_comment(new_comment);
	}, [receive_comment]);

	// useRefを使って前回のコメント数を追跡
	const prevCommentsLengthRef = useRef(comments.length);

	// 自動スクロール処理
	useEffect(() => {
		// 以下の条件でスクロールしない:
		// 1. 自動スクロールが無効
		// 2. ユーザーが手動でスクロールした
		// 3. スクロールエリアが存在しない
		// 4. コメント数が増えていない（初回読み込みを除く）
		if (!auto_scroll || !isAutoScrolling.current || !scrollAreaRef.current)
			return;

		const isCommentAdded =
			comments.length > prevCommentsLengthRef.current ||
			prevCommentsLengthRef.current === 0;

		// コメント数の変更を記録
		prevCommentsLengthRef.current = comments.length;

		// コメントが追加されていない場合はスクロールしない
		if (!isCommentAdded) return;

		// スクロール位置を最下部に移動
		const scrollContainer = scrollAreaRef.current.querySelector(
			"[data-radix-scroll-area-viewport]",
		);
		if (scrollContainer) {
			scrollContainer.scrollTop = scrollContainer.scrollHeight;
		}
	}, [auto_scroll, comments.length]);

	// ユーザー操作でスクロールした場合の処理
	const handle_scroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
		const target = e.currentTarget;
		const isAtBottom =
			target.scrollHeight - target.scrollTop - target.clientHeight < 30;

		// 最下部付近ならば自動スクロールを有効に、そうでなければ無効に
		isAutoScrolling.current = isAtBottom;
	}, []);

	// デバッグ用: 定期的にテストコメントを追加（開発時のみ）
	useEffect(() => {
		// 開発環境のみ有効
		if (process.env.NODE_ENV === "development") {
			const interval = setInterval(add_test_comment, 5000);
			return () => clearInterval(interval);
		}
	}, [add_test_comment]);

	return (
		<div className={cn("h-full flex flex-col", className)}>
			<div className="text-sm font-medium py-2 px-3 border-b sticky top-0 bg-background z-10">
				コメント
			</div>

			<ScrollArea
				className="flex-grow h-[calc(100%-40px)]"
				ref={scrollAreaRef}
				onScroll={handle_scroll}
			>
				<div className="space-y-0">
					{comments.length === 0 ? (
						<div className="text-center py-4 text-muted-foreground text-sm">
							コメントはまだありません
						</div>
					) : (
						comments
							.sort((a, b) => a.timestamp - b.timestamp)
							.map((comment) => (
								<CommentItem key={comment.id} comment={comment} />
							))
					)}
				</div>
			</ScrollArea>

			{/* 開発時のみ表示するテスト用ボタン */}
			{process.env.NODE_ENV === "development" && (
				<button
					type="button"
					onClick={add_test_comment}
					className="text-xs p-1 border rounded-sm mx-3 mb-2 text-muted-foreground hover:bg-accent"
				>
					テストコメント追加（開発用）
				</button>
			)}
		</div>
	);
}

/**
 * コメントアイテムのプロパティ
 */
interface CommentItemProps {
	/**
	 * コメントデータ
	 */
	comment: ChatMessage | SuperchatMessage;
}

/**
 * 個別のコメントアイテムコンポーネント
 *
 * @param props - コンポーネントのプロパティ
 * @returns コメントアイテムのJSXエレメント
 */
function CommentItem({ comment }: CommentItemProps) {
	const is_superchat = comment.type === MessageType.SUPERCHAT;

	// スーパーチャット用の数値IDを抽出（表示名から数字部分のみを取得）
	const numeric_id = is_superchat
		? comment.display_name.replace(/[^\d]/g, "") ||
			Math.floor(Math.random() * 100).toString()
		: "";

	return (
		<div
			className={cn(
				"py-1.5 px-3 text-sm border-b border-border/20 last:border-b-0",
				is_superchat ? "bg-black" : "hover:bg-secondary/10 transition-colors",
			)}
		>
			{is_superchat ? (
				// スーパーチャット表示
				<>
					<div className="flex items-center justify-between gap-2">
						<span className="font-semibold text-white">
							スーパーチャッター{numeric_id}
						</span>
						<span className="px-3 py-0.5 rounded-full bg-zinc-700 text-white font-medium">
							{(comment as SuperchatMessage).superchat.amount} SUI
						</span>
					</div>
					<div className="font-medium text-white mt-1">
						応援メッセージ！ {comment.message}
					</div>
				</>
			) : (
				// 通常コメント表示
				<div className="flex items-start">
					<div className="flex-grow">
						<span className="font-semibold mr-1">{comment.display_name}</span>
						<span className="break-words">{comment.message}</span>
					</div>
				</div>
			)}
		</div>
	);
}
