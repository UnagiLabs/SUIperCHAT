/**
 * ウォレットアドレス設定コンポーネント
 *
 * 配信者のSUIウォレットアドレスを設定し、保存するためのフォームを提供します。
 * ローカルストレージを使用してアドレスを保存します。
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
import { invoke } from "@tauri-apps/api/core";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// ローカルストレージのキー
const WALLET_ADDRESS_KEY = "suiperchat_wallet_address";

/**
 * SUIウォレットアドレスの形式を検証する関数
 * @param {string} address - 検証するアドレス文字列
 * @returns {string | null} - エラーメッセージ (無効な場合) または null (有効な場合)
 */
function validate_sui_address(address: string): string | null {
	const trimmed_address = address.trim();
	if (!trimmed_address) {
		return "ウォレットアドレスを入力してください。";
	}
	if (!trimmed_address.startsWith("0x")) {
		return "無効なSUIウォレットアドレス: '0x' で始まる必要があります。";
	}
	if (trimmed_address.length !== 66) {
		return `無効なSUIウォレットアドレス: 長さが66文字である必要があります (現在 ${trimmed_address.length} 文字)。`;
	}
	// "0x" 以降が16進数文字のみかチェック (正規表現を使用)
	const hex_pattern = /^[a-fA-F0-9]+$/;
	if (!hex_pattern.test(trimmed_address.substring(2))) {
		return "無効なSUIウォレットアドレス: '0x' の後に16進数以外の文字が含まれています。";
	}
	return null; // 有効
}

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
	 * ウォレットアドレスを保存する関数 (Rustバックエンドとローカルストレージ)
	 */
	const handle_save_address = async () => {
		const address_to_save = wallet_address; // trim は validation 関数内で行う

		// --- フロントエンドバリデーション ---
		const validation_error = validate_sui_address(address_to_save);
		if (validation_error) {
			toast.error("入力エラー", { description: validation_error });
			return;
		}
		// --- バリデーションここまで ---

		set_is_saving(true);

		try {
			// Rust バックエンドに保存
			await invoke("set_wallet_address", { address: address_to_save.trim() }); // 送信する前に trim
			console.log("Wallet address sent to backend.");

			// --- ローカルストレージにも保存 (フォールバック/即時反映用) ---
			// 将来的にはRust側からの取得を主とし、不要になる可能性あり
			localStorage.setItem(WALLET_ADDRESS_KEY, address_to_save);

			// --- 成功トースト表示 ---
			toast.success("保存完了", {
				description: "ウォレットアドレスを保存しました。",
			});
		} catch (error) {
			// --- エラーハンドリング ---
			console.error("ウォレットアドレスの保存に失敗しました:", error);
			const error_message =
				error instanceof Error
					? error.message
					: typeof error === "string"
						? error
						: "不明なエラーが発生しました。";
			toast.error("保存エラー", {
				description: `ウォレットアドレスの保存に失敗しました: ${error_message}`,
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
