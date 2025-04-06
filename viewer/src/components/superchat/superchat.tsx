/**
 * スーパーチャットメインコンポーネント
 *
 * スーパーチャット送信機能を統合する親コンポーネント
 *
 * @remarks
 * このコンポーネントは、スーパーチャットのフォームと完了通知をステート管理し、
 * フローを制御します。
 *
 * @returns スーパーチャットメインコンポーネント
 */
"use client";

import { Toaster } from "@/components/ui/sonner";
import { useState } from "react";
import { SuperchatComplete } from "./superchat-complete";
import { SuperchatForm } from "./superchat-form";

/**
 * 送信状態を示す型
 */
type SendState = "form" | "complete";

/**
 * 完了情報の型
 */
interface CompleteInfo {
	amount: number;
	transaction_id?: string;
}

/**
 * スーパーチャットメインコンポーネント
 *
 * @returns スーパーチャットUIのJSXエレメント
 */
export function Superchat() {
	// 現在の表示状態
	const [send_state, set_send_state] = useState<SendState>("form");

	// 完了情報
	const [complete_info, set_complete_info] = useState<CompleteInfo>({
		amount: 0,
	});

	/**
	 * 送信成功時のハンドラー
	 *
	 * @param amount - 送信金額
	 * @param transaction_id - トランザクションID（省略可）
	 */
	function handle_send_success(amount: number, transaction_id?: string) {
		set_complete_info({
			amount,
			transaction_id,
		});
		set_send_state("complete");
	}

	/**
	 * 完了画面を閉じるハンドラー
	 */
	function handle_close_complete() {
		set_send_state("form");
	}

	return (
		<div className="w-full max-w-md mx-auto p-4">
			<Toaster richColors position="top-center" />

			{send_state === "form" && (
				<SuperchatForm on_send_success={handle_send_success} />
			)}

			{send_state === "complete" && (
				<SuperchatComplete
					amount={complete_info.amount}
					transaction_id={complete_info.transaction_id}
					on_close={handle_close_complete}
				/>
			)}
		</div>
	);
}
