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
			console.log("=== コメント取得開始 ===");

			// 現在のセッションIDを取得
			console.log("get_current_session_id を呼び出し中...");
			const session_result = await invoke<string | null>(
				"get_current_session_id",
			);
			console.log("get_current_session_id の結果:", session_result);
			console.log(`session_result の型: ${typeof session_result}`);
			console.log(`session_result === null: ${session_result === null}`);
			console.log(
				`session_result === undefined: ${session_result === undefined}`,
			);

			set_current_session_id(session_result);

			if (
				!session_result ||
				session_result === null ||
				session_result === undefined ||
				session_result === ""
			) {
				console.log("セッションIDが無効のため、空配列を返します");
				// セッションIDがない場合（サーバーが起動していない場合）
				set_comments([]);
				set_is_loading(false);
				return;
			}

			// セッションIDに基づいてコメントを取得
			const limit = max_display_count;
			const sort_asc = true; // 古いものから新しいものへ順に表示

			console.log("get_message_history を呼び出し中...");
			const comments_result = await invoke<MessageData[]>(
				"get_message_history",
				{
					params: {
						limit: limit,
						offset: 0,
						session_id: session_result,
						sort_asc: sort_asc,
					},
				},
			);

			console.log(`取得されたコメント数: ${comments_result.length}`);

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

				// 現在のセッションIDと一致しないメッセージは表示に追加しない
				if (
					current_session_id &&
					new_message.session_id !== current_session_id
				) {
					console.log(
						`セッションIDが一致しないため、メッセージを無視: ${new_message.session_id} !== ${current_session_id}`,
					);
					return;
				}

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
	}, [max_display_count, current_session_id]);

	return (
		<Card className="h-full flex flex-col">
			<CardHeader className="flex-shrink-0 py-3">
				<CardTitle className="text-lg">コメント履歴</CardTitle>
			</CardHeader>
			<CardContent className="flex-grow min-h-0 flex flex-col px-3 pb-3">
				{error && (
					<div className="text-red-500 mb-3 p-2 bg-red-50 dark:bg-red-950/20 rounded-md flex-shrink-0 text-xs">
						{error}
					</div>
				)}

				<div className="flex-grow min-h-0">
					<CommentHistoryTable comments={comments} isLoading={is_loading} />
				</div>

				<div className="mt-2 text-xs text-muted-foreground flex-shrink-0">
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
