"use client";

/**
 * コメント表示コンテナコンポーネント
 *
 * Tauriコマンドを使用してコメントデータを取得し、リアルタイム更新を処理します。
 * 表示件数制限とリアルタイム更新の両立を考慮した実装になっています。
 *
 * @component
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormattedComment } from "@/lib/types";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import CommentHistoryTable from "./CommentHistoryTable";

/**
 * Rustバックエンドから受け取るメッセージの型定義
 */
interface MessageData {
	id: string;
	session_id: string;
	message_type: "CHAT" | "SUPERCHAT";
	display_name: string;
	content: string;
	timestamp: number;
	superchat_specific_data?: {
		amount?: number;
		coin?: string;
		tx_hash?: string;
	};
}

/**
 * Tauriイベントのペイロード型
 */
interface MessageSavedEvent {
	payload: MessageData;
}

/**
 * コメント表示コンポーネント
 */
export default function CommentDisplay() {
	// コメントデータと状態の管理
	const [comments, set_comments] = useState<FormattedComment[]>([]);
	const [current_session_id, set_current_session_id] = useState<string | null>(
		null,
	);
	const [is_loading, set_is_loading] = useState(true);
	const [error, set_error] = useState<string | null>(null);
	const [max_display_count] = useState<number>(100); // 表示上限件数

	/**
	 * コメントデータを取得する関数
	 */
	const fetch_comments = useCallback(async () => {
		set_is_loading(true);
		set_error(null);

		try {
			// 現在のセッションIDを取得
			const session_result = await invoke<string | null>(
				"get_current_session_id",
			);
			set_current_session_id(session_result);

			if (!session_result) {
				// セッションIDがない場合（サーバーが起動していない場合）
				set_comments([]);
				set_is_loading(false);
				return;
			}

			// セッションIDに基づいてコメントを取得
			const limit = max_display_count;
			const sort_asc = true; // 古いものから新しいものへ順に表示

			const comments_result = await invoke<MessageData[]>(
				"get_message_history",
				{
					limit,
					offset: 0,
					session_id: session_result,
					sort_asc,
				},
			);

			// 結果を整形してセット
			const formatted_comments: FormattedComment[] = comments_result.map(
				(comment) => ({
					id: comment.id,
					session_id: comment.session_id,
					message_type: comment.message_type,
					name: comment.display_name,
					message: comment.content,
					timestamp: comment.timestamp,
					superchat: comment.superchat_specific_data
						? {
								amount: comment.superchat_specific_data.amount,
								coin: comment.superchat_specific_data.coin,
								tx_hash: comment.superchat_specific_data.tx_hash,
							}
						: undefined,
				}),
			);

			set_comments(formatted_comments);
		} catch (err) {
			const error_message = err instanceof Error ? err.message : String(err);
			console.error("コメント取得エラー:", error_message);
			set_error(`コメントの読み込み中にエラーが発生しました: ${error_message}`);
			toast.error("コメント取得エラー", {
				description: error_message,
			});
		} finally {
			set_is_loading(false);
		}
	}, [max_display_count]);

	/**
	 * コンポーネントマウント時にデータを初期ロード
	 */
	useEffect(() => {
		fetch_comments();
	}, [fetch_comments]);

	/**
	 * サーバー状態変更時に再取得
	 */
	useEffect(() => {
		const unsubscribe = listen("server_status_updated", () => {
			fetch_comments();
		});

		return () => {
			unsubscribe.then((unsub) => unsub());
		};
	}, [fetch_comments]);

	/**
	 * 新しいメッセージが保存されたイベントの購読
	 */
	useEffect(() => {
		const unsubscribe = listen<MessageData>(
			"message_saved",
			(event: MessageSavedEvent) => {
				const new_message = event.payload;

				// コメント配列に新メッセージを追加
				set_comments((prev_comments) => {
					// 新しいメッセージを整形
					const formatted_message: FormattedComment = {
						id: new_message.id,
						session_id: new_message.session_id,
						message_type: new_message.message_type,
						name: new_message.display_name,
						message: new_message.content,
						timestamp: new_message.timestamp,
						superchat: new_message.superchat_specific_data
							? {
									amount: new_message.superchat_specific_data.amount,
									coin: new_message.superchat_specific_data.coin,
									tx_hash: new_message.superchat_specific_data.tx_hash,
								}
							: undefined,
					};

					// 表示上限を考慮して配列を更新
					const updated_comments = [...prev_comments, formatted_message];
					// 表示上限を超えた場合、最も古いコメントを削除
					if (updated_comments.length > max_display_count) {
						return updated_comments.slice(
							updated_comments.length - max_display_count,
						);
					}
					return updated_comments;
				});
			},
		);

		return () => {
			unsubscribe.then((unsub) => unsub());
		};
	}, [max_display_count]);

	return (
		<Card className="h-full">
			<CardHeader>
				<CardTitle>コメント履歴</CardTitle>
			</CardHeader>
			<CardContent>
				{error && (
					<div className="text-red-500 mb-4 p-2 bg-red-50 dark:bg-red-950/20 rounded-md">
						{error}
					</div>
				)}

				<CommentHistoryTable comments={comments} isLoading={is_loading} />

				<div className="mt-4 text-xs text-muted-foreground">
					{current_session_id ? (
						<>表示中のセッション: {current_session_id}</>
					) : (
						<>
							サーバーが起動していません。サーバーを起動するとコメントが表示されます。
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
