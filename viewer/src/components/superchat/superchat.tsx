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
import { Suspense, useEffect } from "react";
import { useState } from "react";
import { SuperchatForm } from "./superchat-form";

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
	/**
	 * 初期受取人ウォレットアドレス
	 */
	initial_recipient_address?: string;
	/**
	 * コンパクトモードを有効にするかどうか
	 * レイアウト調整用
	 */
	compact_mode?: boolean;
	/**
	 * Tipモードの変更通知コールバック
	 */
	on_tip_mode_change?: (has_tip: boolean) => void;
	/**
	 * 高さ変更通知コールバック
	 */
	on_height_change?: (height: number) => void;
}

/**
 * スーパーチャットコンポーネント
 *
 * @param props - コンポーネントのプロパティ
 * @returns スーパーチャットコンポーネント
 */
export function Superchat({
	className,
	on_send_success,
	initial_recipient_address,
	compact_mode = false,
	on_tip_mode_change,
	on_height_change,
}: SuperchatProps) {
	return (
		<Suspense
			fallback={
				<div className="h-full flex items-center justify-center">
					読み込み中...
				</div>
			}
		>
			<SuperchatContent
				className={className}
				on_send_success={on_send_success}
				initial_recipient_address={initial_recipient_address}
				compact_mode={compact_mode}
				on_tip_mode_change={on_tip_mode_change}
				on_height_change={on_height_change}
			/>
		</Suspense>
	);
}

/**
 * URLパラメータを取得するコンポーネント
 * useSearchParamsを使用するため、このコンポーネントは個別に分離
 */
function UrlParamReader({
	onStreamerAddressChange,
}: {
	onStreamerAddressChange: (address: string) => void;
}) {
	// URLパラメータから配信者のウォレットアドレスを取得
	const search_params = useSearchParams();
	const streamer_address = search_params.get("streamerAddress") || "";

	// アドレスが変更されたら親コンポーネントに通知
	useEffect(() => {
		onStreamerAddressChange(streamer_address);
	}, [streamer_address, onStreamerAddressChange]);

	return null; // このコンポーネントはUIをレンダリングしない
}

/**
 * useSearchParamsを使用するスーパーチャットの内部コンポーネント
 */
function SuperchatContent({
	className,
	on_send_success,
	initial_recipient_address,
	compact_mode = false,
	on_tip_mode_change,
	on_height_change,
}: SuperchatProps) {
	// Tipモード状態
	const [has_tip, set_has_tip] = useState<boolean>(false);
	// URLから取得した配信者アドレス
	const [streamer_address, set_streamer_address] = useState<string>("");

	// Tipモード変更を親コンポーネントに通知
	useEffect(() => {
		if (on_tip_mode_change) {
			on_tip_mode_change(has_tip);
		}
	}, [has_tip, on_tip_mode_change]);

	/**
	 * Tipモード変更ハンドラー
	 */
	function handle_tip_mode_change(has_tip: boolean) {
		set_has_tip(has_tip);
	}

	// 通常はフォームを表示
	return (
		<div
			className={className}
			style={{ height: "100%", display: "flex", flexDirection: "column" }}
		>
			{/* URLパラメータを読み取るコンポーネント */}
			<Suspense fallback={null}>
				<UrlParamReader onStreamerAddressChange={set_streamer_address} />
			</Suspense>

			<SuperchatForm
				on_send_success={on_send_success}
				initial_recipient_address={
					initial_recipient_address || streamer_address
				}
				compact_mode={true}
				integrated_ui={true}
				on_tip_mode_change={handle_tip_mode_change}
				on_height_change={on_height_change}
			/>
		</div>
	);
}
