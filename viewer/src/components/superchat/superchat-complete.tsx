/**
 * スーパーチャット完了通知コンポーネント
 *
 * スーパーチャットの送信が完了した際に表示する完了通知コンポーネント
 *
 * @remarks
 * このコンポーネントは、スーパーチャットの送信が成功した際に表示されます。
 * 送信金額と処理結果を表示し、ユーザーにフィードバックを提供します。
 *
 * @returns スーパーチャット完了通知コンポーネント
 */
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

/**
 * スーパーチャット完了通知コンポーネントのプロパティ
 */
interface SuperchatCompleteProps {
	/**
	 * 送信された金額
	 */
	amount: number;

	/**
	 * トランザクションID
	 */
	transaction_id?: string;

	/**
	 * 完了画面を閉じる関数
	 */
	on_close: () => void;
}

/**
 * スーパーチャット完了通知コンポーネント
 *
 * @param props - コンポーネントのプロパティ
 * @returns スーパーチャット完了通知のJSXエレメント
 */
export function SuperchatComplete({
	amount,
	transaction_id,
	on_close,
}: SuperchatCompleteProps) {
	// 成功を表す緑色のテキストカラークラス
	const success_text_color = "text-green-500";

	return (
		<div className="w-full max-w-md mx-auto">
			<Card className="overflow-hidden">
				<div className="text-center py-8 px-4">
					<div className="flex justify-center">
						<CheckCircle className={`w-16 h-16 mb-4 ${success_text_color}`} />
					</div>
					<h2 className={`text-2xl font-bold mb-2 ${success_text_color}`}>
						Sent Successfully
					</h2>
					<p className="text-muted-foreground">
						Your Super Chat has been sent successfully
					</p>
				</div>
				<CardContent className="pt-6">
					<div className="space-y-4">
						<div className="text-center">
							<p className="text-sm text-muted-foreground mb-1">Amount Sent</p>
							<p className="text-2xl font-bold">{amount} SUI</p>
						</div>

						{transaction_id && (
							<div className="bg-muted p-3 rounded-md">
								<p className="text-xs text-muted-foreground mb-1">
									Transaction ID
								</p>
								<p className="text-xs overflow-hidden text-ellipsis break-all">
									{transaction_id}
								</p>
							</div>
						)}

						<div className="text-center text-sm text-muted-foreground">
							<p>It may take a moment to appear on the stream.</p>
						</div>
					</div>
				</CardContent>
				<CardFooter>
					<Button onClick={on_close} className="w-full">
						Close
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
