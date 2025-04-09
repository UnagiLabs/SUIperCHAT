/**
 * ウォレットアドレス設定コンポーネント
 *
 * 配信者のSUIウォレットアドレスを設定し、保存するためのフォームを提供します。
 * ローカルストレージを使用してアドレスを保存します。
 *
 * @module components/features/dashboard/WalletAddressConfig
 * @returns {JSX.Element} ウォレットアドレス設定コンポーネント
 */

"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// ローカルストレージのキー
const WALLET_ADDRESS_KEY = "suiperchat_wallet_address";

/**
 * ウォレットアドレス設定コンポーネント
 * @returns {JSX.Element} コンポーネント
 */
export default function WalletAddressConfig() {
	const [wallet_address, set_wallet_address] = useState("");
	const [is_saving, set_is_saving] = useState(false);

	/**
	 * コンポーネントマウント時にローカルストレージから情報を読み込む
	 */
	useEffect(() => {
		const saved_address = localStorage.getItem(WALLET_ADDRESS_KEY);
		if (saved_address) {
			set_wallet_address(saved_address);
		}
	}, []);

	/**
	 * ウォレットアドレスを保存する関数
	 */
	const handle_save_address = () => {
		// 入力値の簡易バリデーション
		if (!wallet_address.trim()) {
			toast.error("エラー", {
				description: "ウォレットアドレスを入力してください。",
			});
			return;
		}

		set_is_saving(true);

		try {
			// ローカルストレージに保存
			localStorage.setItem(WALLET_ADDRESS_KEY, wallet_address.trim());

			// 成功トースト表示
			toast.success("保存完了", {
				description: "ウォレットアドレスを保存しました。",
			});

			// TODO: 後で実装：Rustバックエンドへの保存や他の状態更新処理をここで行う
		} catch (error) {
			console.error("ウォレットアドレスの保存に失敗しました:", error);
			toast.error("保存エラー", {
				description: "ウォレットアドレスの保存に失敗しました。",
			});
		} finally {
			set_is_saving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>ウォレットアドレス設定</CardTitle>
				<CardDescription>
					配信者のSUIウォレットアドレスを設定します。視聴者からのスーパーチャットはこのアドレスに送信されます。
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="wallet-address">SUIウォレットアドレス</Label>
					<div className="flex space-x-2">
						<Input
							id="wallet-address"
							placeholder="0x..."
							value={wallet_address}
							onChange={(e) => set_wallet_address(e.target.value)}
						/>
						<Button onClick={handle_save_address} disabled={is_saving}>
							<Save className="mr-2 h-4 w-4" />
							保存
						</Button>
					</div>
				</div>
				<p className="text-sm text-muted-foreground">
					注意:
					このアドレスはOBSオーバーレイと視聴者向けURLに使用されます。必ず正確なアドレスを入力してください。
				</p>
			</CardContent>
		</Card>
	);
}
