/**
 * スーパーチャットコンポーネント
 *
 * 視聴者がスーパーチャットを送信するためのUI全体を構成するコンポーネント
 *
 * @remarks
 * - ウォレット接続ボタン
 * - スーパーチャットフォーム
 *
 * @returns スーパーチャットコンポーネント
 */
"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Toaster } from "sonner";

import { WalletConnectButton } from "@/components/wallet/wallet-connect-button";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { SuperchatComplete } from "./superchat-complete";
import { SuperchatForm } from "./superchat-form";

/**
 * 送信状態を表す型
 */
type SendState = "form" | "complete";

/**
 * 完了情報を表す型
 */
interface CompleteInfo {
	amount: number;
	display_name: string;
	message: string;
	transaction_id?: string;
}

/**
 * スーパーチャットコンポーネントのプロパティ
 */
interface SuperchatProps {
	/**
	 * コンポーネントのクラス名
	 */
	className?: string;
	/**
	 * 送信成功時のコールバック関数
	 */
	on_send_success?: (
		amount: number,
		display_name: string,
		message: string,
		transaction_id?: string,
	) => void;
}

/**
 * スーパーチャットコンポーネント
 *
 * @param props - コンポーネントのプロパティ
 * @returns スーパーチャットコンポーネントのJSXエレメント
 */
export function Superchat({ className = "", on_send_success }: SuperchatProps) {
	// URLパラメータから配信者のウォレットアドレスを取得
	const search_params = useSearchParams();
	const streamer_address = search_params.get("streamerAddress") || "";

	// 現在の表示状態
	const [send_state, set_send_state] = useState<SendState>("form");
	// 完了情報
	const [complete_info, set_complete_info] = useState<CompleteInfo>({
		amount: 0,
		display_name: "",
		message: "",
	});

	// 現在のウォレットアカウント
	const account = useCurrentAccount();

	/**
	 * 送信成功時のハンドラー
	 *
	 * @param amount - 送信金額
	 * @param display_name - 表示名
	 * @param message - メッセージ内容
	 * @param transaction_id - トランザクションID
	 */
	function handle_send_success(
		amount: number,
		display_name: string,
		message: string,
		transaction_id?: string,
	) {
		set_complete_info({
			amount,
			display_name,
			message,
			transaction_id,
		});
		set_send_state("complete");

		// 親コンポーネントのコールバックがあれば呼び出す
		if (on_send_success) {
			on_send_success(amount, display_name, message, transaction_id);
		}
	}

	/**
	 * 完了画面を閉じるハンドラー
	 */
	function handle_close_complete() {
		set_send_state("form");
	}

	return (
		<div className={`superchat ${className}`}>
			<Toaster richColors position="top-center" />

			<>
				{send_state === "form" && (
					<SuperchatForm
						on_send_success={handle_send_success}
						initial_recipient_address={streamer_address}
					/>
				)}

				{send_state === "complete" && (
					<SuperchatComplete
						amount={complete_info.amount}
						display_name={complete_info.display_name}
						message={complete_info.message}
						transaction_id={complete_info.transaction_id}
						on_close={handle_close_complete}
					/>
				)}
			</>
		</div>
	);
}
