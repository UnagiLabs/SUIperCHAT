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
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useMobileKeyboard } from "@/hooks/useMobileKeyboard";
import { toast } from "sonner";

import {
	DEFAULT_GAS_BUDGET,
	PACKAGE_ID,
	PAYMENT_CONFIG_ID,
	SUPPORTED_COINS,
} from "@/lib/constants"; // 定数をインポート
import { fromContractValue, toContractValue } from "@/lib/utils"; // ユーティリティをインポート
import { cn } from "@/lib/utils";
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

	/**
	 * Tipモード変更時のコールバック関数
	 */
	on_tip_mode_change?: (has_tip: boolean) => void;

	/**
	 * 高さ変更時のコールバック関数
	 */
	on_height_change?: (height: number) => void;
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
	on_tip_mode_change,
	on_height_change,
}: SuperchatFormProps = {}) {
	// 確認モード状態管理は不要になったため削除
	// Tipの有無を管理するステート
	const [has_tip, set_has_tip] = useState(false);
	// 入力フィールドがフォーカス中かどうかの状態
	const [isInputFocused, setIsInputFocused] = useState(false);

	// WebSocketコンテキストを取得
	const { actions } = useWebSocket();
	// モバイルキーボードの状態を取得
	const { isKeyboardVisible, keyboardHeight } = useMobileKeyboard();

	// ユーザー名コンテキストを取得
	const { username, setUsername } = useUser();
	// 名前入力後の自動保存用タイマー参照
	const debouncedNameUpdate = useRef<NodeJS.Timeout | null>(null);
	// フォーム全体の参照
	const formRef = useRef<HTMLFormElement>(null);

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

	// Tipモード変更通知
	useEffect(() => {
		if (on_tip_mode_change) {
			on_tip_mode_change(has_tip);
		}
	}, [has_tip, on_tip_mode_change]);

	// 高さ変更を通知する関数
	const notifyHeightChange = useCallback(() => {
		if (on_height_change && formRef.current) {
			on_height_change(formRef.current.offsetHeight);
		}
	}, [on_height_change]);

	// テキストエリアの高さが変更されたときに親コンポーネントに通知
	const handleTextareaResize = useCallback(
		(e: React.FormEvent<HTMLTextAreaElement>) => {
			const target = e.target as HTMLTextAreaElement;
			// 高さをリセットしてスクロールの高さに合わせる
			target.style.height = "auto";
			const newHeight = Math.min(target.scrollHeight, 96); // 最大高さを96pxに制限
			target.style.height = `${newHeight}px`;

			// 少し遅延させて高さ変更を通知（DOM更新後に実行）
			setTimeout(notifyHeightChange, 0);
		},
		[notifyHeightChange],
	);

	// Tipモード変更時に高さ変更を通知
	useEffect(() => {
		notifyHeightChange();
	}, [notifyHeightChange]);

	// Tipモードが変更されたときにも高さを通知
	useEffect(() => {
		if (on_tip_mode_change) {
			on_tip_mode_change(has_tip);
		}
		// Tipモードが変わったら高さも変わるので通知
		notifyHeightChange();
	}, [has_tip, on_tip_mode_change, notifyHeightChange]);

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
		} catch (error) {
			console.error("Failed to send chat message:", error);
			toast.error("Failed to send message", {
				description: error instanceof Error ? error.message : String(error),
			});
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
			return;
		}

		// 確認モードなしで直接送信処理へ進む
		// Tipなしの場合、WebSocketでチャットメッセージとして直接送信
		if (!sendTip) {
			await sendNormalMessage(values);
		} else {
			// Tipありの場合、スーパーチャットとして送信
			await sendSuperchat(values);
		}
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

	// 入力フィールドのフォーカス/ブラーハンドラー
	const handleInputFocus = useCallback(() => {
		setIsInputFocused(true);
	}, []);

	const handleInputBlur = useCallback(() => {
		// 少し遅延させてフォーカスが他の入力要素に移った場合を考慮
		setTimeout(() => {
			const activeElement = document.activeElement;
			const isFormInput = formRef.current?.contains(activeElement);
			if (!isFormInput) {
				setIsInputFocused(false);
			}
		}, 100);
	}, []);

	// モバイルキーボード表示時のスタイル設定
	const isMobileKeyboardFixed = isKeyboardVisible && isInputFocused;
	// 画面幅で横画面かどうかを判定
	const isLandscape =
		typeof window !== "undefined" && window.innerWidth > window.innerHeight;

	// キーボード高さを微調整（余白を減らすため）
	const adjustedKeyboardHeight = keyboardHeight > 0 ? keyboardHeight - 20 : 0;

	const mobileKeyboardStyle = isMobileKeyboardFixed
		? {
				position: "fixed" as const,
				bottom: `${adjustedKeyboardHeight}px`,
				left: isLandscape ? "50%" : "0",
				right: isLandscape ? "auto" : "0",
				width: isLandscape ? "50%" : "100%",
				transform: isLandscape ? "translateX(-100%)" : "none",
				zIndex: 1000,
				backgroundColor: "hsl(var(--background))",
				borderTop: "1px solid hsl(var(--border))",
				boxShadow: "0 -4px 12px -2px rgb(0 0 0 / 0.15)",
				// Safe Areaはvisualviewportで既に考慮されているため削除
				// アニメーション効果
				transition: "all 0.2s ease-in-out",
			}
		: {};

	// UIは常に統合UIを使用（non-integrated UIは使用されていないため削除）
	return (
		<>
			{/* キーボード表示時のオーバーレイ */}
			{isMobileKeyboardFixed && (
				<div
					className="fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-200"
					style={{ zIndex: 999 }}
					onClick={() => {
						// オーバーレイクリックでフォーカスを外す
						const activeElement = document.activeElement as HTMLElement;
						if (activeElement?.blur) {
							activeElement.blur();
						}
					}}
					onKeyDown={(e) => {
						// Escapeキーでフォーカスを外す
						if (e.key === "Escape") {
							const activeElement = document.activeElement as HTMLElement;
							if (activeElement?.blur) {
								activeElement.blur();
							}
						}
					}}
					tabIndex={-1}
					role="button"
					aria-label="フォーカスを外す"
				/>
			)}

			<div className="h-full flex flex-col justify-end">
				<Form {...form}>
					<form
						ref={formRef}
						onSubmit={form.handleSubmit(on_submit)}
						className={cn(
							has_tip ? "p-1 pb-2 space-y-1" : "px-1 py-1.5 space-y-0",
							isMobileKeyboardFixed ? "px-2 py-2" : "",
						)}
						style={mobileKeyboardStyle}
					>
						<div
							className={cn(
								"flex items-center justify-between",
								has_tip ? "mb-0.5" : "",
							)}
						>
							<FormField
								control={form.control}
								name="display_name"
								render={({ field }) => (
									<FormItem className="flex-grow mr-1">
										<Input
											placeholder="表示名"
											{...field}
											className="text-base md:text-xs h-10 md:h-6"
											onChange={(e) => {
												field.onChange(e);
												updateUsername(e.target.value);
											}}
											onFocus={handleInputFocus}
											onBlur={handleInputBlur}
										/>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="flex items-center space-x-0.5 bg-secondary rounded-lg p-0.5">
								<button
									type="button"
									onClick={() => set_has_tip(false)}
									className={`px-1.5 py-0.5 text-sm md:text-xs rounded-md transition-colors ${
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
									className={`px-1.5 py-0.5 text-sm md:text-xs rounded-md transition-colors ${
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
												<SelectTrigger className="w-16 text-base md:text-xs h-10 md:h-6">
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
									render={({ field: { onChange, value, ...field } }) => {
										// 表示用の値を管理（入力中の状態を保持）
										const [displayValue, setDisplayValue] = useState(
											value === 0 ? "" : value.toString(),
										);

										// valueが外部から変更された場合に表示値を更新
										useEffect(() => {
											setDisplayValue(value === 0 ? "" : value.toString());
										}, [value]);

										return (
											<FormItem className="flex-grow">
												<Input
													type="text"
													placeholder="金額"
													inputMode="decimal"
													pattern="[0-9]*\.?[0-9]*"
													{...field}
													value={displayValue}
													onChange={(e) => {
														const inputValue = e.target.value;

														// 空文字の場合
														if (inputValue === "") {
															setDisplayValue("");
															onChange(0);
															return;
														}

														// 数値として妥当な形式かチェック（末尾のドットも許可）
														if (/^\d*\.?\d*$/.test(inputValue)) {
															setDisplayValue(inputValue);

															// 数値に変換可能な場合のみフォームの値を更新
															// 末尾が.の場合は変換しない（入力中のため）
															if (!inputValue.endsWith(".")) {
																const val = Number.parseFloat(inputValue);
																if (!Number.isNaN(val)) {
																	onChange(val);
																}
															}
														}
													}}
													onFocus={handleInputFocus}
													onBlur={(e) => {
														// フォーカスが外れたときに表示値を整形
														if (
															displayValue !== "" &&
															!displayValue.endsWith(".")
														) {
															const val = Number.parseFloat(displayValue);
															if (!Number.isNaN(val)) {
																setDisplayValue(val.toString());
															}
														}
														handleInputBlur();
													}}
													className="text-base md:text-xs h-10 md:h-6"
												/>
												<FormMessage />
											</FormItem>
										);
									}}
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
										<Textarea
											placeholder="メッセージを入力..."
											{...field}
											className="text-base md:text-xs min-h-10 md:min-h-6 max-h-24 py-1 px-3 resize-none overflow-hidden"
											style={{ height: "auto" }}
											onInput={handleTextareaResize}
											onFocus={handleInputFocus}
											onBlur={handleInputBlur}
										/>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="submit"
								className="ml-1 h-10 md:h-6"
								disabled={isPending}
								size="sm"
							>
								{isPending ? "Sending..." : "Send"}
							</Button>
						</div>
					</form>
				</Form>
			</div>
		</>
	);
}
