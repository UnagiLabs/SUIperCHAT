/**
 * コメント表示コンポーネント
 *
 * コメントとスーパーチャットを表示するためのコンポーネント。
 * スクロール可能なリスト形式でコメントを表示します。
 * 仮想スクロールを使用して大量のコメントを効率的に表示します。
 *
 * @remarks
 * - 仮想スクロールによる効率的なレンダリング
 * - 一般コメントとスーパーチャットの視覚的な区別
 * - 自動スクロール機能
 * - 過去ログの無限スクロール
 *
 * @file コメント表示コンポーネントの実装
 */

"use client";

import { useWebSocket } from "@/components/providers/WebSocketProvider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	type ChatMessage,
	MessageType,
	type SuperchatMessage,
} from "@/lib/types/websocket";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";

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
	// WebSocketからメッセージとアクションを取得
	const { state, actions } = useWebSocket();
	const { messages, isLoadingHistory, hasMoreHistory, historyError } = state;

	// スクロール関連の状態
	const parentRef = useRef<HTMLDivElement>(null);
	const [parentElement, setParentElement] = useState<HTMLElement | null>(null);
	const isAutoScrollingRef = useRef(auto_scroll);
	const prevMessagesLengthRef = useRef(messages.length);

	// コメントをタイムスタンプでソート
	const sortedMessages = useMemo(() => {
		return [...messages].sort((a, b) => a.timestamp - b.timestamp);
	}, [messages]);

	// 各アイテムの高さを推定する関数
	const estimateItemSize = useCallback(
		(index: number) => {
			const message = sortedMessages[index];
			if (!message) return 40; // デフォルト値
			return message.type === MessageType.SUPERCHAT ? 80 : 40;
		},
		[sortedMessages],
	);

	// 仮想スクロールの設定
	const virtualizer = useVirtualizer({
		count: sortedMessages.length,
		getScrollElement: () => parentElement,
		estimateSize: estimateItemSize,
		overscan: 10, // スクロール時により多くのアイテムを事前に描画
	});

	// 親要素の設定
	useLayoutEffect(() => {
		if (parentRef.current) {
			// ScrollAreaのビューポート要素を取得
			const viewport = parentRef.current.querySelector(
				"[data-radix-scroll-area-viewport]",
			);
			setParentElement(viewport as HTMLElement);
		}
	}, []);

	// 無限スクロール - 上部へのスクロールで過去ログを読み込む
	const handleScrollUpward = useCallback(() => {
		if (
			isLoadingHistory ||
			!hasMoreHistory ||
			!parentElement ||
			!virtualizer.range ||
			!virtualizer.range.startIndex
		) {
			return;
		}

		// スクロール位置が上部20%以内になったら過去ログを読み込む
		const { scrollTop, scrollHeight, clientHeight } = parentElement;
		const scrollThreshold = 0.2; // 上部20%
		const scrollPercentage = scrollTop / (scrollHeight - clientHeight);

		if (scrollPercentage < scrollThreshold) {
			actions.requestHistory(50);
		}
	}, [
		isLoadingHistory,
		hasMoreHistory,
		parentElement,
		virtualizer.range,
		actions,
	]);

	// スクロールイベントハンドラ
	const handleScroll = useCallback(
		(e: React.UIEvent<HTMLDivElement>) => {
			const target = e.currentTarget;
			const isAtBottom =
				target.scrollHeight - target.scrollTop - target.clientHeight < 30;

			// 最下部付近ならば自動スクロールを有効に、そうでなければ無効に
			isAutoScrollingRef.current = isAtBottom;

			// 上部へのスクロールで過去ログを読み込む
			handleScrollUpward();
		},
		[handleScrollUpward],
	);

	// 新しいメッセージが追加されたら自動スクロール
	useEffect(() => {
		// 以下の条件でスクロールしない:
		// 1. 親要素が存在しない
		// 2. 自動スクロールが無効
		// 3. メッセージ数が増えていない
		if (!parentElement || !isAutoScrollingRef.current || !virtualizer.range)
			return;

		const messagesAdded = messages.length > prevMessagesLengthRef.current;
		prevMessagesLengthRef.current = messages.length;

		if (messagesAdded) {
			// スクロール位置を最下部に移動
			virtualizer.scrollToIndex(sortedMessages.length - 1, {
				align: "end",
				behavior: "smooth",
			});
		}
	}, [messages.length, parentElement, sortedMessages.length, virtualizer]);

	// 仮想アイテムをレンダリング
	const virtualItems = virtualizer.getVirtualItems();

	return (
		<div className={cn("h-full flex flex-col", className)}>
			<div className="text-xs font-medium py-0.5 px-2 border-b sticky top-0 bg-background z-10">
				コメント
			</div>

			<ScrollArea
				className="flex-1 overflow-hidden"
				ref={parentRef}
				onScroll={handleScroll}
				type="always"
				style={
					{
						"--scrollbar-size": "8px",
						"--scrollbar-thumb-color": "rgba(120, 120, 120, 0.5)",
						"--scrollbar-background-color": "transparent",
						height: "100%",
					} as React.CSSProperties
				}
			>
				{/* 過去ログ読み込み中の表示 */}
				{isLoadingHistory && (
					<div className="flex items-center justify-center py-2 border-b">
						<Loader2 className="h-4 w-4 animate-spin mr-2" />
						<span className="text-xs text-muted-foreground">
							過去のコメントを読み込み中...
						</span>
					</div>
				)}

				{/* エラー表示 */}
				{historyError && (
					<div className="flex items-center justify-center py-2 border-b">
						<span className="text-xs text-red-500 mr-2">
							エラー: {historyError}
						</span>
						<button
							type="button"
							onClick={() => actions.requestHistory()}
							className="text-xs text-primary hover:underline"
						>
							再試行
						</button>
					</div>
				)}

				{/* 仮想スクロールのコンテナ */}
				<div
					className="relative w-full"
					style={{ height: `${virtualizer.getTotalSize()}px` }}
				>
					{virtualItems.map((virtualItem) => {
						const comment = sortedMessages[virtualItem.index];
						if (!comment) return null;

						return (
							<div
								key={virtualItem.key}
								data-index={virtualItem.index}
								ref={virtualizer.measureElement}
								className="absolute top-0 left-0 w-full"
								style={{
									height: `${virtualItem.size}px`,
									transform: `translateY(${virtualItem.start}px)`,
								}}
							>
								<CommentItem comment={comment} />
							</div>
						);
					})}
				</div>

				{/* メッセージがない場合の表示 */}
				{sortedMessages.length === 0 && !isLoadingHistory && (
					<div className="text-center py-2 text-muted-foreground text-xs">
						コメントはまだありません
					</div>
				)}
			</ScrollArea>
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

	return (
		<div
			className={cn(
				"py-0.5 px-1.5 text-xs border-b border-border/20 last:border-b-0",
				is_superchat ? "bg-black" : "hover:bg-secondary/10 transition-colors",
			)}
		>
			{is_superchat ? (
				// スーパーチャット表示
				<>
					<div className="flex items-center justify-between gap-1 pr-1">
						<span className="font-semibold text-white text-[10px]">
							{comment.display_name}
						</span>
						<span className="px-1.5 py-0.5 rounded-full bg-zinc-700 text-white font-medium text-[10px] flex-shrink-0">
							{(comment as SuperchatMessage).superchat.amount} SUI
						</span>
					</div>
					<div className="font-medium text-white text-[10px]">
						{comment.message}
					</div>
				</>
			) : (
				// 通常コメント表示
				<div className="flex items-start">
					<div className="flex-grow">
						<span className="font-semibold mr-1 text-[11px]">
							{comment.display_name}
						</span>
						<span className="break-words text-[11px]">{comment.message}</span>
					</div>
				</div>
			)}
		</div>
	);
}
