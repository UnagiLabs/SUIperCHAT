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
			// メッセージが存在しない場合はデフォルト値を返す
			if (!message) return 22;

			// メッセージの種類に応じて基本高さを設定
			const baseHeight = message.type === MessageType.SUPERCHAT ? 40 : 22;

			// メッセージの長さから追加の高さを計算
			const messageText = message.message || "";
			const messageLength = messageText.length;

			// スーパーチャットと通常メッセージで異なる計算を適用
			if (message.type === MessageType.SUPERCHAT) {
				// スーパーチャットは1行あたり約30文字として計算
				const estimatedLines = Math.ceil(messageLength / 30);
				// 基本高さに各行の高さを加算（1行目は基本高さに含まれる）
				return baseHeight + Math.max(0, estimatedLines - 1) * 16; // 追加の各行に16px
			}

			// 通常コメントは1行あたり約40文字として計算
			// 改行コードも考慮
			const newlineCount = (messageText.match(/\n/g) || []).length;
			const textLines = Math.ceil(messageLength / 40) + newlineCount;

			// 通常は1行で収まるように設計されているため、追加行がある場合のみ高さを増加
			return baseHeight + Math.max(0, textLines - 1) * 16;
		},
		[sortedMessages],
	);

	// 仮想スクロールの設定
	const virtualizer = useVirtualizer({
		count: sortedMessages.length,
		getScrollElement: () => parentElement,
		estimateSize: estimateItemSize,
		overscan: 10, // スクロール時により多くのアイテムを事前に描画
		gap: 0, // アイテム間のギャップを0に設定
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
			<div className="text-sm font-medium py-0.5 px-2 border-b sticky top-0 bg-background z-10">
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
					<div className="flex items-center justify-center py-1 border-b">
						<Loader2 className="h-4 w-4 animate-spin mr-2" />
						<span className="text-sm text-muted-foreground">
							過去のコメントを読み込み中...
						</span>
					</div>
				)}

				{/* エラー表示 */}
				{historyError && (
					<div className="flex items-center justify-center py-1 border-b">
						<span className="text-sm text-red-500 mr-2">
							エラー: {historyError}
						</span>
						<button
							type="button"
							onClick={() => actions.requestHistory()}
							className="text-sm text-primary hover:underline"
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
					<div className="text-center py-1 text-muted-foreground text-sm">
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

	// スーパーチャットの金額に応じた背景色を設定
	const getSuperchatBgColor = () => {
		if (!is_superchat) return "";

		const amount = (comment as SuperchatMessage).superchat.amount;

		// 金額に応じてグラデーションカラーを返す
		if (amount >= 50)
			return "bg-gradient-to-r from-yellow-500 to-amber-600 shadow-[0_1px_3px_rgba(255,215,0,0.3)]";
		if (amount >= 20)
			return "bg-gradient-to-r from-red-500 to-red-600 shadow-[0_1px_3px_rgba(255,0,0,0.3)]";
		if (amount >= 10)
			return "bg-gradient-to-r from-blue-500 to-blue-600 shadow-[0_1px_3px_rgba(0,0,255,0.3)]";
		if (amount >= 5)
			return "bg-gradient-to-r from-green-500 to-green-600 shadow-[0_1px_3px_rgba(0,255,0,0.3)]";
		return "bg-gradient-to-r from-purple-500 to-purple-600 shadow-[0_1px_3px_rgba(128,0,128,0.3)]";
	};

	return (
		<div
			className={cn(
				is_superchat
					? "py-0.1 px-1.5 text-sm h-full shadow-sm border-b border-border/5"
					: "py-0 px-1 text-xs h-full hover:bg-secondary/5 transition-colors border-b border-border/5",
				is_superchat ? `${getSuperchatBgColor()} text-white` : "",
			)}
		>
			{is_superchat ? (
				// スーパーチャット表示
				<>
					<div className="flex items-center justify-between gap-0.5 mb-0">
						<span className="font-semibold text-white text-xs leading-tight">
							{comment.display_name}
						</span>
						<span className="px-1 py-0 rounded-full bg-black/40 text-white font-medium text-xs flex-shrink-0 leading-none">
							{(comment as SuperchatMessage).superchat.amount} SUI
						</span>
					</div>
					<div className="font-medium text-white text-xs mt-0.5 leading-tight whitespace-pre-wrap break-words break-all overflow-hidden w-full">
						{comment.message}
					</div>
				</>
			) : (
				// 通常コメント表示
				<div className="flex items-start leading-none py-0 w-full">
					<div className="flex-grow">
						<span className="font-semibold mr-0.5 text-xs">
							{comment.display_name}:
						</span>
						<span className="text-xs whitespace-pre-wrap break-words break-all overflow-hidden">
							{comment.message}
						</span>
					</div>
				</div>
			)}
		</div>
	);
}
