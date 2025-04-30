/**
 * スーパーチャットフォームコンポーネント
 *
 * 視聴者が配信者にスーパーチャットを送信するためのフォームコンポーネント
 *
 * @remarks
 * - 金額選択UI（0/1/3/5/10 SUI）
 * - 送付先アドレス入力フィールド
 * - メッセージ入力フィールド
 * - 表示名入力フィールド
 * - 送信確認・送信機能
 *
 * @returns スーパーチャットフォームコンポーネント
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { useWebSocket } from "@/components/providers/WebSocketProvider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import {
	DEFAULT_GAS_BUDGET,
	PACKAGE_ID,
	PAYMENT_CONFIG_ID,
	SUI_TYPE_ARG,
} from "@/lib/constants"; // 定数をインポート
import { mistToSui, suiToMist } from "@/lib/utils"; // ユーティリティをインポート
// Sui SDK インポート
import {
	useCurrentAccount,
	useSignAndExecuteTransaction,
	useSuiClient, // useSuiClient をインポート
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions"; // Transaction をインポート

// フォームのバリデーションスキーマ
const superchat_form_schema = z.object({
	amount: z.number().min(0).max(10),
	recipient_address: z
		.string()
		.min(42, {
			message: "Please enter a valid wallet address.",
		})
		.max(66, {
			message: "Please enter a valid wallet address.",
		}),
	display_name: z
		.string()
		.min(1, {
			message: "Please enter your display name.",
		})
		.max(20, {
			message: "Display name must be within 20 characters.",
		}),
	message: z
		.string()
		.max(100, {
			message: "Message must be within 100 characters.",
		})
		.optional(),
});

// フォームの入力値の型
type SuperchatFormValues = z.infer<typeof superchat_form_schema>;

// ウォレットエラーの型
interface WalletError extends Error {
	code?: number;
	name: string;
}

// スーパーチャット金額のオプション
const amount_options = [
	{ value: 0, label: "No tips", color: "bg-yellow-500" },
	{ value: 1, label: "1 SUI", color: "bg-yellow-500" },
	{ value: 3, label: "3 SUI", color: "bg-yellow-500" },
	{ value: 5, label: "5 SUI", color: "bg-yellow-500" },
	{ value: 10, label: "10 SUI", color: "bg-yellow-500" },
];

// デフォルトのフォーム値
const default_values: Partial<SuperchatFormValues> = {
	amount: 0,
	recipient_address: "",
	display_name: "",
	message: "",
};

/**
 * スーパーチャットフォームコンポーネントのプロパティ
 */
interface SuperchatFormProps {
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
}

/**
 * スーパーチャットフォームコンポーネント
 *
 * @param props - コンポーネントのプロパティ
 * @returns スーパーチャットフォームのJSXエレメント
 */
export function SuperchatForm({
	on_send_success,
	initial_recipient_address = "",
}: SuperchatFormProps = {}) {
	// 確認モード状態管理
	const [confirm_mode, set_confirm_mode] = useState(false);

	// WebSocketコンテキストを取得
	const { actions } = useWebSocket();

	// Suiクライアントとウォレット接続ステータスを取得
	const suiClient = useSuiClient(); // suiClient を取得
	const currentAccount = useCurrentAccount();
	const { isPending, mutate: signAndExecuteTransaction } =
		useSignAndExecuteTransaction(); // mutate も取得

	// フォーム作成
	const form = useForm<SuperchatFormValues>({
		resolver: zodResolver(superchat_form_schema),
		defaultValues: {
			...default_values,
			recipient_address: initial_recipient_address,
		},
	});

	// 初期アドレスが変更された場合にフォームを更新
	useEffect(() => {
		if (initial_recipient_address) {
			form.setValue("recipient_address", initial_recipient_address);
		}
	}, [initial_recipient_address, form]);

	/**
	 * フォーム送信ハンドラー
	 *
	 * @param values - フォームの入力値
	 */
	async function on_submit(values: SuperchatFormValues) {
		// ウォレット接続チェック
		if (!currentAccount) {
			toast.error("Wallet not connected", {
				description: "Please connect your wallet to send a Super Chat",
			});
			return;
		}

		if (!confirm_mode) {
			// 確認モードに切り替え
			set_confirm_mode(true);
			return;
		}

		// チップ金額が0の場合、WebSocketでチャットメッセージとして直接送信
		if (values.amount === 0) {
			console.log("Sending as normal chat message (no tip)");

			try {
				// チャットメッセージとして送信
				actions.sendChatMessage(values.display_name, values.message || "");

				toast.success("Message sent successfully!");

				// コールバック関数があれば実行
				on_send_success?.(
					values.amount,
					values.display_name,
					values.message || "",
				);

				// フォームをリセット
				form.reset({
					...default_values,
					recipient_address: values.recipient_address,
				});

				// 確認モードをリセット
				set_confirm_mode(false);

				return;
			} catch (error) {
				console.error("Failed to send chat message:", error);
				toast.error("Failed to send message", {
					description: error instanceof Error ? error.message : String(error),
				});
				// 確認モードをリセット
				set_confirm_mode(false);
				return;
			}
		}

		// === ステップ3: PTB構築 ===
		try {
			// 1. SUI → MIST 換算
			const suiAmountMist = suiToMist(values.amount);
			const GAS_BUDGET = BigInt(DEFAULT_GAS_BUDGET);

			// 2. すべての SUI コインを取得（ページング対応）
			let nextCursor: string | null | undefined = null;
			const allCoins: Awaited<ReturnType<typeof suiClient.getCoins>>["data"] =
				[];
			do {
				const page = await suiClient.getCoins({
					owner: currentAccount.address,
					coinType: SUI_TYPE_ARG,
					limit: 50,
					cursor: nextCursor,
				});
				allCoins.push(...page.data);
				nextCursor = page.nextCursor;
			} while (nextCursor);

			// 2-1. 合計残高チェック
			const totalBalance = allCoins.reduce(
				(a, c) => a + BigInt(c.balance),
				BigInt(0),
			);
			if (totalBalance < suiAmountMist + GAS_BUDGET) {
				toast.error("Insufficient SUI balance", {
					description: `Need at least ${mistToSui(
						suiAmountMist + GAS_BUDGET,
					)} SUI including gas.`,
				});
				set_confirm_mode(false);
				return;
			}

			// 2-2. ガス用コインを選定（ガス予算をまかなえる最小のコイン）
			allCoins.sort((a, b) => {
				const balanceA = BigInt(a.balance);
				const balanceB = BigInt(b.balance);
				return balanceB > balanceA ? 1 : balanceB < balanceA ? -1 : 0;
			});
			const gasCoin =
				allCoins.find((c) => BigInt(c.balance) >= GAS_BUDGET) || allCoins[0];

			// ガスコインを除いた残りを支払い用候補に
			const coinsForPayment = allCoins.filter(
				(c) => c.coinObjectId !== gasCoin.coinObjectId,
			);

			// primary＝支払い元コイン
			const primary = coinsForPayment[0] ?? gasCoin; // 1 枚しか無ければ同一

			// 3. Transaction Block 構築
			const tx = new Transaction();

			// 3-1. ガスコイン固定（digest / version は getCoins のレスポンスに含まれる）
			tx.setGasPayment([
				{
					objectId: gasCoin.coinObjectId,
					digest: gasCoin.digest,
					version: gasCoin.version,
				},
			]);
			tx.setGasBudget(DEFAULT_GAS_BUDGET);

			// 3-2. ガスコインと別オブジェクトなら merge で残高集約
			const coinsToMerge = coinsForPayment.filter(
				(c) => c.coinObjectId !== primary.coinObjectId,
			);
			if (
				primary.coinObjectId !== gasCoin.coinObjectId &&
				coinsToMerge.length
			) {
				tx.mergeCoins(
					tx.object(primary.coinObjectId),
					coinsToMerge.map((c) => tx.object(c.coinObjectId)),
				);
			}

			// 4. 支払い額を split
			const sourceForSplit =
				primary.coinObjectId === gasCoin.coinObjectId
					? tx.gas // 1 枚しかないケース
					: tx.object(primary.coinObjectId);

			const [paymentCoin] = tx.splitCoins(sourceForSplit, [
				tx.pure.u64(suiAmountMist),
			]);

			// 5. Move コントラクト呼び出し
			tx.moveCall({
				target: `${PACKAGE_ID}::payment::process_superchat_payment`,
				arguments: [
					tx.object(PAYMENT_CONFIG_ID),
					paymentCoin,
					tx.pure.u64(suiAmountMist),
					tx.pure.address(values.recipient_address),
				],
				typeArguments: [SUI_TYPE_ARG],
			});
			// === ステップ4: トランザクション実行 ===
			signAndExecuteTransaction(
				{
					transaction: tx,
				},
				{
					onSuccess: (result) => {
						console.log("Transaction successful:", result);
						const digest = result.digest;

						// WebSocketを使ってスーパーチャットメッセージを送信
						actions.sendSuperchatMessage(
							values.display_name,
							values.message || "",
							{
								amount: values.amount,
								tx_hash: digest,
								wallet_address: currentAccount.address,
							},
						);

						toast.success("Super Chat sent successfully!", {
							description: `Transaction digest: ${digest.substring(0, 8)}...`,
						});

						// コールバック関数があれば実行
						on_send_success?.(
							values.amount,
							values.display_name,
							values.message || "",
							digest,
						);

						// フォームをリセット
						form.reset({
							...default_values,
							recipient_address: values.recipient_address,
						});

						// 確認モードをリセット
						set_confirm_mode(false);
					},
					onError: (error) => {
						console.error("Transaction failed:", error);
						const wallet_error = error as WalletError;

						let error_message = "Unknown error occurred.";
						if (wallet_error.code === 4001) {
							// MetaMaskのユーザーキャンセルエラーコード
							error_message = "Transaction was rejected by the user.";
						} else if (wallet_error.message) {
							error_message = wallet_error.message;
						}

						toast.error("Super Chat failed", {
							description: error_message,
						});

						// 確認モードをリセット
						set_confirm_mode(false);
					},
				},
			);
		} catch (error) {
			console.error("Payment preparation failed:", error);
			toast.error("Payment preparation failed", {
				description: error instanceof Error ? error.message : String(error),
			});
			// 確認モードをリセット
			set_confirm_mode(false);
		}
	}

	// 確認モードキャンセル処理
	function handle_cancel() {
		set_confirm_mode(false);
	}

	// 現在選択されている金額
	const selected_amount = form.watch("amount");

	// 選択されている金額のオプションを取得
	const selected_option = amount_options.find(
		(option) => option.value === selected_amount,
	);

	return (
		<Card className="w-full max-w-md mx-auto">
			<CardHeader>
				<CardTitle>Send a Super Chat</CardTitle>
				<CardDescription>
					Send a message and optionally SUI directly to the streamer
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(on_submit)} className="space-y-6">
						<FormField
							control={form.control}
							name="amount"
							render={({ field }) => (
								<FormItem className="space-y-3">
									<FormLabel>Amount</FormLabel>
									<FormControl>
										<div className="space-y-2">
											{/* No tips ボタン */}
											<Button
												key={amount_options[0].value}
												type="button"
												variant={
													amount_options[0].value === field.value
														? "default"
														: "outline"
												}
												className={`w-full ${
													amount_options[0].value === field.value
														? `${amount_options[0].color} text-white`
														: ""
												}`}
												onClick={() => field.onChange(amount_options[0].value)}
											>
												<Coins className="mr-2 h-4 w-4" />
												{amount_options[0].label}
											</Button>

											{/* SUI金額ボタン */}
											<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
												{amount_options.slice(1).map((option) => (
													<Button
														key={option.value}
														type="button"
														variant={
															option.value === field.value
																? "default"
																: "outline"
														}
														className={
															option.value === field.value
																? `${option.color} text-white`
																: ""
														}
														onClick={() => field.onChange(option.value)}
													>
														<Coins className="mr-2 h-4 w-4" />
														{option.label}
													</Button>
												))}
											</div>
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="recipient_address"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Recipient Address</FormLabel>
									<FormControl>
										<Input
											placeholder="Enter streamer's wallet address"
											{...field}
											disabled={!!initial_recipient_address}
											className={
												initial_recipient_address
													? "bg-muted cursor-not-allowed"
													: ""
											}
										/>
									</FormControl>
									<FormDescription>
										{initial_recipient_address
											? "The streamer's wallet address (automatically filled)"
											: "The wallet address of the streamer"}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="display_name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Display Name</FormLabel>
									<FormControl>
										<Input placeholder="Your display name" {...field} />
									</FormControl>
									<FormDescription>Name shown on stream</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="message"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Message (Optional)</FormLabel>
									<FormControl>
										<Input placeholder="Message to the streamer" {...field} />
									</FormControl>
									<FormDescription>
										Message shown on stream (up to 100 characters)
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{confirm_mode && (
							<div className="p-4 border rounded-md bg-secondary">
								<h4 className="font-medium mb-2">Confirm</h4>
								<p className="text-sm mb-4">
									Are you sure you want to send the following?
								</p>

								<div className="grid grid-cols-3 gap-2 text-sm mb-1">
									<span className="font-medium">Amount:</span>
									<span className="col-span-2">{selected_option?.label}</span>
								</div>

								<div className="grid grid-cols-3 gap-2 text-sm mb-1">
									<span className="font-medium">To:</span>
									<span className="col-span-2 font-mono text-xs break-all">
										{form.getValues("recipient_address")}
									</span>
								</div>

								<div className="grid grid-cols-3 gap-2 text-sm mb-1">
									<span className="font-medium">Display Name:</span>
									<span className="col-span-2">
										{form.getValues("display_name")}
									</span>
								</div>

								{form.getValues("message") && (
									<div className="grid grid-cols-3 gap-2 text-sm">
										<span className="font-medium">Message:</span>
										<span className="col-span-2">
											{form.getValues("message")}
										</span>
									</div>
								)}
							</div>
						)}

						<div className="flex gap-2">
							{confirm_mode ? (
								<>
									<Button
										type="button"
										variant="outline"
										onClick={handle_cancel}
										className="flex-1"
									>
										Cancel
									</Button>
									<Button
										type="submit"
										className={`flex-1 ${selected_option?.color} text-white`}
										disabled={isPending}
									>
										{isPending ? "Sending..." : "Send"}
									</Button>
								</>
							) : (
								<Button type="submit" className="w-full">
									Confirm
								</Button>
							)}
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
}
