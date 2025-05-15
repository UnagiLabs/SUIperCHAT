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
import { Form, FormField, FormItem, FormMessage } from "@/components/ui/form";
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

	/**
	 * コンパクトモードを有効にするかどうか
	 * (レイアウト調整用)
	 */
	compact_mode?: boolean;

	/**
	 * 統合UIモードを有効にするかどうか
	 * コメントリストと統合表示する場合はtrue
	 */
	integrated_ui?: boolean;
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
	compact_mode = false,
	integrated_ui = false,
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
	 * Tipmodeなしで通常メッセージを送信する処理
	 *
	 * @param values - フォームの入力値
	 */
	async function sendNormalMessage(values: SuperchatFormValues) {
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
				display_name: values.display_name,
			});

			// 確認モードをリセット
			set_confirm_mode(false);
		} catch (error) {
			console.error("Failed to send chat message:", error);
			toast.error("Failed to send message", {
				description: error instanceof Error ? error.message : String(error),
			});
			// 確認モードをリセット
			set_confirm_mode(false);
		}
	}

	/**
	 * スーパーチャットを送信する処理
	 *
	 * @param values - フォームの入力値
	 */
	async function sendSuperchat(values: SuperchatFormValues) {
		try {
			// ウォレット接続チェック
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
			tx.setSender(currentAccount.address);

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

			// ガス上限設定
			tx.setGasBudget(DEFAULT_GAS_BUDGET);

			// 4. トランザクション実行
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

						// 結果処理
						if (result?.digest) {
							console.log("Transaction successfully executed on chain.");
							const digest = result.digest;

							// WebSocketでスーパーチャットメッセージを送信
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
								display_name: values.display_name,
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
			set_confirm_mode(false);
		}
	}

	/**
	 * フォーム送信ハンドラー
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
			await sendNormalMessage(values);
		} else {
			// Tipありの場合、スーパーチャットとして送信
			await sendSuperchat(values);
		}
	}

	// 確認モードキャンセル処理
	function handle_cancel() {
		set_confirm_mode(false);
	}

	// ユーザー名を更新する関数
	function updateUsername(name: string) {
		if (debouncedNameUpdate.current) {
			clearTimeout(debouncedNameUpdate.current);
		}
		debouncedNameUpdate.current = setTimeout(() => {
			setUsername(name);
		}, 1000);
	}

	// UIは常に統合UIを使用（non-integrated UIは使用されていないため削除）
	return (
		<div className="h-full flex flex-col justify-center">
			<Form {...form}>
				<form onSubmit={form.handleSubmit(on_submit)} className="space-y-1">
					<div className="flex items-center justify-between mb-0.5">
						<FormField
							control={form.control}
							name="display_name"
							render={({ field }) => (
								<FormItem className="flex-grow mr-1">
									<Input
										placeholder="表示名"
										{...field}
										className="text-xs h-6"
										onChange={(e) => {
											field.onChange(e);
											updateUsername(e.target.value);
										}}
									/>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex items-center space-x-0.5 bg-secondary rounded-lg p-0.5">
							<button
								type="button"
								onClick={() => set_has_tip(false)}
								className={`px-1.5 py-0.5 text-xs rounded-md transition-colors ${
									!has_tip
										? "bg-card shadow-sm"
										: "text-muted-foreground hover:bg-secondary/80"
								}`}
							>
								NoTip
							</button>
							<button
								type="button"
								onClick={() => set_has_tip(true)}
								className={`px-1.5 py-0.5 text-xs rounded-md transition-colors ${
									has_tip
										? "bg-card shadow-sm"
										: "text-muted-foreground hover:bg-secondary/80"
								}`}
							>
								SuperChat
							</button>
						</div>
					</div>

					{has_tip && (
						<div className="flex items-center gap-1 mb-0.5">
							<FormField
								control={form.control}
								name="coinTypeArg"
								render={({ field: coinField }) => (
									<FormItem className="flex-grow-0">
										<Select
											value={coinField.value}
											onValueChange={coinField.onChange}
										>
											<SelectTrigger className="w-16 text-xs h-6">
												<SelectValue placeholder="Coin" />
											</SelectTrigger>
											<SelectContent>
												{SUPPORTED_COINS.map((coin) => (
													<SelectItem key={coin.typeArg} value={coin.typeArg}>
														{coin.symbol}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="amount"
								render={({ field: { onChange, value, ...field } }) => (
									<FormItem className="flex-grow">
										<Input
											type="number"
											placeholder="金額"
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
											}}
											className="text-xs h-6"
										/>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					)}

					<FormField
						control={form.control}
						name="recipient_address"
						render={({ field }) => (
							<FormItem className="hidden">
								<Input {...field} type="hidden" />
							</FormItem>
						)}
					/>

					<div className="flex items-start">
						<FormField
							control={form.control}
							name="message"
							render={({ field }) => (
								<FormItem className="flex-grow">
									<Input
										placeholder="メッセージを入力..."
										{...field}
										className="text-xs h-6"
									/>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button
							type="submit"
							className="ml-1 h-6"
							disabled={isPending}
							size="sm"
						>
							{confirm_mode ? (isPending ? "送信中..." : "送信") : "送信"}
						</Button>
					</div>

					{confirm_mode && (
						<div className="p-1 border rounded-md bg-secondary/50 text-xs mb-0.5">
							<p className="font-medium mb-0.5 text-[10px]">送信内容を確認</p>
							{has_tip && (
								<div className="flex gap-1 mb-0.5 text-[10px]">
									<span className="font-medium">Tip:</span>
									<span>
										{form.getValues("amount")}{" "}
										{SUPPORTED_COINS.find(
											(c) => c.typeArg === form.getValues("coinTypeArg"),
										)?.symbol || ""}
									</span>
								</div>
							)}
							<div className="flex gap-1 mb-0.5 text-[10px]">
								<span className="font-medium">名前:</span>
								<span>{form.getValues("display_name")}</span>
							</div>
							{form.getValues("message") && (
								<div className="flex gap-1 mb-0.5 text-[10px]">
									<span className="font-medium">メッセージ:</span>
									<span className="break-words">
										{form.getValues("message")}
									</span>
								</div>
							)}
							<div className="flex gap-1 mt-0.5">
								<Button
									type="button"
									variant="outline"
									onClick={handle_cancel}
									className="text-[10px] h-5 flex-1"
									size="sm"
								>
									キャンセル
								</Button>
								<Button
									type="submit"
									className="text-[10px] h-5 flex-1"
									disabled={isPending}
									size="sm"
								>
									{isPending ? "送信中..." : "確定"}
								</Button>
							</div>
						</div>
					)}
				</form>
			</Form>
		</div>
	);
}
