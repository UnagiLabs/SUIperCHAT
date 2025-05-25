"use client";

/**
 * コメント表示コンテナコンポーネント
 *
 * Tauriコマンドを使用してコメントデータを取得し、リアルタイム更新を処理します。
 * 表示件数制限とリアルタイム更新の両立を考慮した実装になっています。
 * セッションID選択機能により、任意のセッションのコメントを表示できます。
 *
 * @component
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { FormattedComment, SessionInfo } from "@/lib/types";
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
	const [selected_session_id, set_selected_session_id] = useState<
		string | null
	>(null);
	const [available_sessions, set_available_sessions] = useState<SessionInfo[]>(
		[],
	);
	const [is_loading, set_is_loading] = useState(true);
	const [error, set_error] = useState<string | null>(null);
	const [max_display_count] = useState<number>(100); // 表示上限件数

	/**
	 * 利用可能なセッション情報リストを取得する関数
	 */
	const fetch_available_sessions = useCallback(async () => {
		try {
			console.log("=== セッション情報リスト取得開始 ===");
			const sessions = await invoke<SessionInfo[]>("get_all_sessions_info");
			console.log("取得されたセッション情報:", sessions);
			set_available_sessions(sessions);
		} catch (err) {
			const error_message = err instanceof Error ? err.message : String(err);
			console.error("セッション情報リスト取得エラー:", error_message);
			// エラーが発生してもコメント表示機能は継続
		}
	}, []);

	/**
	 * 指定されたセッションIDのコメントデータを取得する関数
	 */
	const fetch_comments_by_session_id = useCallback(
		async (session_id: string | null) => {
			set_is_loading(true);
			set_error(null);

			try {
				console.log("=== コメント取得開始 ===");
				console.log("指定されたセッションID:", session_id);

				if (!session_id || session_id === "") {
					console.log("セッションIDが無効のため、空配列を返します");
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
							session_id: session_id,
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
				set_error(
					`コメントの読み込み中にエラーが発生しました: ${error_message}`,
				);
				toast.error("コメント取得エラー", {
					description: error_message,
				});
			} finally {
				set_is_loading(false);
			}
		},
		[max_display_count],
	);

	/**
	 * 現在のセッションIDを取得してコメントデータを取得する関数
	 */
	const fetch_comments = useCallback(async () => {
		try {
			console.log("=== 現在のセッションID取得開始 ===");

			// 現在のセッションIDを取得
			console.log("get_current_session_id を呼び出し中...");
			const session_result = await invoke<string | null>(
				"get_current_session_id",
			);
			console.log("get_current_session_id の結果:", session_result);

			set_current_session_id(session_result);

			// 現在のセッションIDが有効でセッション選択されていない場合は自動選択
			if (session_result && !selected_session_id) {
				set_selected_session_id(session_result);
				await fetch_comments_by_session_id(session_result);
			} else {
				// 選択されたセッションIDでコメントを取得
				await fetch_comments_by_session_id(selected_session_id);
			}
		} catch (err) {
			const error_message = err instanceof Error ? err.message : String(err);
			console.error("コメント取得エラー:", error_message);
			set_error(`コメントの読み込み中にエラーが発生しました: ${error_message}`);
			toast.error("コメント取得エラー", {
				description: error_message,
			});
		}
	}, [fetch_comments_by_session_id, selected_session_id]);

	/**
	 * セッション選択ハンドラー
	 */
	const handle_session_select = useCallback(
		(session_id: string) => {
			console.log("セッション選択:", session_id);
			set_selected_session_id(session_id);
			fetch_comments_by_session_id(session_id);
		},
		[fetch_comments_by_session_id],
	);

	/**
	 * コンポーネントマウント時にデータを初期ロード
	 */
	useEffect(() => {
		fetch_available_sessions();
		fetch_comments();
	}, [fetch_available_sessions, fetch_comments]);

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

				// 選択されたセッションIDと一致しないメッセージは表示に追加しない
				if (
					selected_session_id &&
					new_message.session_id !== selected_session_id
				) {
					console.log(
						`セッションIDが一致しないため、メッセージを無視: ${new_message.session_id} !== ${selected_session_id}`,
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
	}, [max_display_count, selected_session_id]);

	return (
		<Card className="h-full flex flex-col">
			<CardHeader className="flex-shrink-0">
				<CardTitle>コメント履歴</CardTitle>
				<div className="space-y-2">
					{/* セッション選択プルダウン */}
					<div className="flex items-center gap-2">
						<label htmlFor="session-select" className="text-sm font-medium">
							セッション選択:
						</label>
						{available_sessions.length > 0 ? (
							<Select
								value={selected_session_id || ""}
								onValueChange={handle_session_select}
							>
								<SelectTrigger id="session-select" className="w-full text-left">
									<SelectValue
										placeholder="セッションを選択してください"
										className="text-left"
									/>
								</SelectTrigger>
								<SelectContent>
									{available_sessions.map((session) => (
										<SelectItem key={session.id} value={session.id}>
											<div className="flex flex-col">
												<span className="font-medium">
													{new Date(session.started_at).toLocaleString(
														"ja-JP",
														{
															year: "numeric",
															month: "2-digit",
															day: "2-digit",
															hour: "2-digit",
															minute: "2-digit",
														},
													)}
												</span>
												<span className="text-xs text-muted-foreground">
													{session.id}
													{session.id === current_session_id && (
														<span className="ml-1 text-green-600 dark:text-green-400">
															(現在のセッション)
														</span>
													)}
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<div className="flex-1 px-3 py-2 text-sm text-muted-foreground border rounded-md bg-muted/50">
								利用可能なセッションがありません
							</div>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex-grow min-h-0 flex flex-col">
				{error && (
					<div className="text-red-500 mb-4 p-2 bg-red-50 dark:bg-red-950/20 rounded-md flex-shrink-0">
						{error}
					</div>
				)}

				<div className="flex-grow min-h-0">
					<CommentHistoryTable comments={comments} isLoading={is_loading} />
				</div>

				<div className="mt-4 text-xs text-muted-foreground flex-shrink-0">
					{selected_session_id ? (
						<>
							表示中のセッション: {selected_session_id}
							{selected_session_id === current_session_id && (
								<span className="ml-2 text-green-600 dark:text-green-400">
									(現在のアクティブセッション)
								</span>
							)}
						</>
					) : (
						<>
							セッションを選択してください。サーバーを起動すると現在のセッションが自動選択されます。
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
