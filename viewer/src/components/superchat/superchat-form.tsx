/**
 * スーパーチャットフォームコンポーネント
 *
 * 視聴者が配信者にスーパーチャットを送信するためのフォームコンポーネント
 *
 * @remarks
 * - 任意の金額と通貨タイプを選択可能
 * - 送付先アドレス入力フィールド
 * - メッセージ入力フィールド
 * - 表示名入力フィールド
 * - 送信確認・送信機能
 *
 * @returns スーパーチャットフォームコンポーネント
 */
"use client";

import { useUser } from "@/context/UserContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import {
	DEFAULT_GAS_BUDGET,
	PACKAGE_ID,
	PAYMENT_CONFIG_ID,
	SUPPORTED_COINS,
} from "@/lib/constants"; // 定数をインポート
import { fromContractValue, toContractValue } from "@/lib/utils"; // ユーティリティをインポート
// Sui SDK インポート
import {
	useCurrentAccount,
	useSignAndExecuteTransaction,
	useSuiClient, // useSuiClient をインポート
} from "@mysten/dapp-kit";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions"; // Transaction とcoinWithBalanceをインポート

// フォームのバリデーションスキーマ
const superchat_form_schema = z.object({
	amount: z
		.number()
		.nonnegative({ message: "Amount must be a non-negative number." }),
	coinTypeArg: z
		.string()
		.refine((value) => SUPPORTED_COINS.some((coin) => coin.typeArg === value), {
			message: "Please select a supported coin type.",
		}),
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

// デフォルトのフォーム値
const default_values: Partial<SuperchatFormValues> = {
	amount: 0,
	coinTypeArg: SUPPORTED_COINS[0].typeArg, // デフォルトはSUI
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
	// Tipの有無を管理するステート
	const [has_tip, set_has_tip] = useState(false);

	// WebSocketコンテキストを取得
	const { actions } = useWebSocket();

	// ユーザー名コンテキストを取得
	const { username, setUsername } = useUser();
	// 名前入力後の自動保存用タイマー参照
	const debouncedNameUpdate = useRef<NodeJS.Timeout | null>(null);

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
			display_name: username || default_values.display_name,
		},
	});

	// 初期アドレスとユーザー名が変更された場合にフォームを更新
	useEffect(() => {
		if (initial_recipient_address) {
			form.setValue("recipient_address", initial_recipient_address);
		}
	}, [initial_recipient_address, form]);

	// ユーザー名が変更された場合にフォームを更新
	useEffect(() => {
		if (username) {
			form.setValue("display_name", username);
		}
	}, [username, form]);

	/**
	 * フォーム送信ハンドラー
	 *
	 * @param values - フォームの入力値
	 */
	async function on_submit(values: SuperchatFormValues) {
		// チップ金額が0または非Tip選択状態のチェック
		const sendTip = has_tip && values.amount > 0;

		// Tipありで金額が0より大きい場合のみウォレット接続チェック
		if (sendTip && !currentAccount) {
			toast.error("Wallet Connection Required", {
				description: (
					<div className="mt-2 flex flex-col gap-2">
						<p>Wallet connection is required to send tips.</p>
						<p>
							Please connect your wallet using the "Connect Wallet" button at
							the top.
						</p>
						<p>
							Alternatively, you can disable tipping to send a message without
							wallet connection.
						</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-1"
							onClick={() => {
								set_has_tip(false);
								form.setValue("amount", 0);
								toast.success("Tip removed", {
									description:
										"You can now send your message without wallet connection",
								});
							}}
						>
							Disable Tip
						</Button>
					</div>
				),
				duration: 10000,
			});
			set_confirm_mode(false);
			return;
		}

		if (!confirm_mode) {
			// 確認モードに切り替え
			set_confirm_mode(true);
			return;
		}

		// Tipなしの場合、WebSocketでチャットメッセージとして直接送信
		if (!sendTip) {
			console.log("Sending as normal chat message (no tip)");

			try {
				// チャットメッセージとして送信
				actions.sendChatMessage(values.display_name, values.message || "");

				toast.success("Message sent successfully!");

				// コールバック関数があれば実行
				on_send_success?.(
					0, // 金額は0
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
			// ウォレット接続チェック (念のため)
			if (!currentAccount) {
				toast.error("Wallet Connection Required", {
					description: "Please connect your wallet to send tips.",
				});
				set_confirm_mode(false);
				return;
			}

			// 選択されたコインタイプの取得
			const selectedCoinType = values.coinTypeArg;
			const selectedCoin = SUPPORTED_COINS.find(
				(c) => c.typeArg === selectedCoinType,
			);

			if (!selectedCoin) {
				toast.error("Invalid Coin Type", {
					description: "Please select a valid coin type.",
				});
				set_confirm_mode(false);
				return;
			}

			// SUIコインタイプの定義
			const SUI_TYPE_ARG = SUPPORTED_COINS.find(
				(coin) => coin.symbol === "SUI",
			)?.typeArg;

			if (!SUI_TYPE_ARG) {
				toast.error("SUI coin type not found in supported coins", {
					description: "Configuration error: SUI coin type is missing.",
				});
				set_confirm_mode(false);
				return;
			}

			// 1. 金額をコントラクト用の単位に変換
			const contractAmount = toContractValue(values.amount, selectedCoinType);

			// 2. 残高チェック
			const balance = await suiClient.getBalance({
				owner: currentAccount.address,
				coinType: selectedCoinType,
			});

			// SUIの場合はガス代も考慮
			const requiredBalance =
				selectedCoinType === SUI_TYPE_ARG
					? BigInt(contractAmount) + BigInt(DEFAULT_GAS_BUDGET)
					: BigInt(contractAmount);

			if (BigInt(balance.totalBalance) < requiredBalance) {
				const errorMessage =
					selectedCoinType === SUI_TYPE_ARG
						? `Need at least ${fromContractValue(contractAmount, selectedCoinType)} ${selectedCoin.symbol} plus gas fee`
						: `Need at least ${fromContractValue(contractAmount, selectedCoinType)} ${selectedCoin.symbol}`;

				toast.error(`Insufficient ${selectedCoin.symbol} balance`, {
					description: errorMessage,
				});
				set_confirm_mode(false);
				return;
			}

			// ガス用のSUI残高チェック（SUI以外の場合）
			if (selectedCoinType !== SUI_TYPE_ARG) {
				const suiBalance = await suiClient.getBalance({
					owner: currentAccount.address,
					coinType: SUI_TYPE_ARG,
				});

				if (BigInt(suiBalance.totalBalance) < BigInt(DEFAULT_GAS_BUDGET)) {
					toast.error("Insufficient SUI balance for gas", {
						description: `Need at least ${fromContractValue(DEFAULT_GAS_BUDGET, SUI_TYPE_ARG)} SUI for gas.`,
					});
					set_confirm_mode(false);
					return;
				}
			}

			// 3. Transaction Block 構築
			const tx = new Transaction();
			tx.setSender(currentAccount.address); // 安全のため明示的に設定

			// coinWithBalance が自動でSplit/Mergeを注入
			const paymentCoin = coinWithBalance({
				balance: BigInt(contractAmount),
				type: selectedCoinType,
				// SUI送信時は同じコインをガスにも使用可能に
				useGasCoin: selectedCoinType === SUI_TYPE_ARG,
			});

			// Moveコントラクト呼び出し
			tx.moveCall({
				target: `${PACKAGE_ID}::payment::process_superchat_payment`,
				arguments: [
					tx.object(PAYMENT_CONFIG_ID),
					paymentCoin,
					tx.pure.u64(contractAmount),
					tx.pure.address(values.recipient_address),
				],
				typeArguments: [selectedCoinType],
			});

			// ガス上限設定（ガスコインの選択はウォレットに任せる）
			tx.setGasBudget(DEFAULT_GAS_BUDGET);

			// === ステップ4: トランザクション実行 ===
			signAndExecuteTransaction(
				{
					transaction: tx,
				},
				{
					onSettled: (result, error) => {
						// 常に確認モードをリセット（共通処理）
						set_confirm_mode(false);

						// エラー処理
						if (error) {
							console.error("Transaction failed:", error);
							const wallet_error = error as WalletError;

							let error_message = "Unknown error occurred.";
							if (wallet_error.code === 4001) {
								// ユーザーによるキャンセル
								error_message = "Transaction was rejected by the user.";
							} else if (wallet_error.message) {
								error_message = wallet_error.message;
							}

							toast.error("Super Chat failed", {
								description: error_message,
							});
							return;
						}

						// 結果処理 (resultがundefinedでないことを確認)
						if (result?.digest) {
							// トランザクションの成功をチェック
							// 注意: effectsはすぐに利用できないため、digestが存在することで成功と判断
							console.log("Transaction successfully executed on chain.");
							const digest = result.digest;

							// WebSocketを使ってスーパーチャットメッセージを送信
							actions.sendSuperchatMessage(
								values.display_name,
								values.message || "",
								{
									amount: values.amount,
									coin: selectedCoin.symbol,
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
						} else {
							// トランザクション失敗時の処理
							console.warn("Transaction was not successful on chain");
							toast.error("Super Chat failed", {
								description: "Transaction execution failed.",
							});
						}
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
							render={({ field: { onChange, value, ...field } }) => (
								<FormItem className="space-y-3">
									<div className="flex justify-between items-center">
										<FormLabel>Tip</FormLabel>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => {
												set_has_tip(!has_tip);
												if (!has_tip) {
													// Tipを有効にする時、デフォルト値を設定
													onChange(0);
												} else {
													// Tipを無効にする時、金額を0にリセット
													onChange(0);
												}
											}}
											className="text-xs h-6 px-2"
										>
											{has_tip ? "Remove Tip" : "Add Tip"}
										</Button>
									</div>

									{has_tip ? (
										<FormControl>
											<div className="space-y-4">
												<div className="flex items-center gap-3">
													<FormField
														control={form.control}
														name="coinTypeArg"
														render={({ field: coinField }) => (
															<FormItem className="flex-grow-0">
																<Select
																	value={coinField.value}
																	onValueChange={coinField.onChange}
																>
																	<SelectTrigger className="w-24">
																		<SelectValue placeholder="Coin" />
																	</SelectTrigger>
																	<SelectContent>
																		{SUPPORTED_COINS.map((coin) => (
																			<SelectItem
																				key={coin.typeArg}
																				value={coin.typeArg}
																			>
																				{coin.symbol}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
																<FormMessage />
															</FormItem>
														)}
													/>

													<FormItem className="flex-grow">
														<Input
															type="number"
															placeholder="Amount"
															step="any"
															min="0"
															{...field}
															value={value === 0 ? "" : value}
															onChange={(e) => {
																const val =
																	e.target.value === ""
																		? 0
																		: Number.parseFloat(e.target.value);
																onChange(val);

																// 金額変更時のガイダンス表示
																if (val > 0 && !currentAccount) {
																	toast.info("Wallet Connection Required", {
																		description:
																			"Please connect your wallet using the 'Connect Wallet' button at the top to send tips.",
																		duration: 5000,
																	});
																}
															}}
															className="max-w-full"
														/>
														<FormMessage />
													</FormItem>
												</div>
											</div>
										</FormControl>
									) : (
										<FormControl>
											<div className="p-4 border rounded border-dashed text-center">
												<span className="text-muted-foreground">
													No tip will be sent (message only)
												</span>
											</div>
										</FormControl>
									)}

									<FormDescription>
										{has_tip ? (
											<span
												className={
													!currentAccount ? "text-amber-500 font-medium" : ""
												}
											>
												{!currentAccount
													? "Wallet connection required for sending tips"
													: "Tips will be sent with your message"}
											</span>
										) : (
											"Send message only (no wallet connection needed)"
										)}
									</FormDescription>
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
										<Input
											placeholder="Your display name"
											{...field}
											onChange={(e) => {
												field.onChange(e);
												// ユーザー名の更新（debounce処理）
												if (debouncedNameUpdate.current) {
													clearTimeout(debouncedNameUpdate.current);
												}
												debouncedNameUpdate.current = setTimeout(() => {
													setUsername(e.target.value);
													toast.success("Display name saved", {
														description:
															"This name will be used for your future messages",
														duration: 2000,
													});
												}, 1000);
											}}
										/>
									</FormControl>
									<FormDescription>
										This name will be displayed with your message. Changes will
										be automatically saved.
									</FormDescription>
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
									<span className="font-medium">Tip:</span>
									<span className="col-span-2">
										{has_tip
											? `${form.getValues("amount")} ${
													SUPPORTED_COINS.find(
														(c) => c.typeArg === form.getValues("coinTypeArg"),
													)?.symbol || ""
												}`
											: "No tip"}
									</span>
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
									<Button type="submit" className="flex-1" disabled={isPending}>
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
