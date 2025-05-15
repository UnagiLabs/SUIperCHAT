/**
 * ヘッダーウォレットボタンコンポーネント
 *
 * ウォレット接続状態に応じてヘッダーのウォレット接続ボタンの表示を制御します。
 * 未接続の場合は「Connect Wallet (Optional)」と表示し、接続済みの場合は「Wallet Connected」と表示します。
 *
 * @module components/wallet/header-wallet-button
 */

"use client";

import { Button } from "@/components/ui/button";
import { useAspectRatio } from "@/hooks/useAspectRatio";
import { cn } from "@/lib/utils";
import { useCurrentAccount } from "@mysten/dapp-kit";
import type React from "react";
import { WalletConnectButton } from "./wallet-connect-button";

/**
 * ヘッダーウォレットボタンコンポーネント
 *
 * @returns {JSX.Element} ウォレット接続ボタン
 */
export function HeaderWalletButton(): React.ReactElement {
	const account = useCurrentAccount();
	// アスペクト比に基づくレイアウトモードを取得
	const { is_landscape } = useAspectRatio({ threshold: 1.0 });

	return (
		<div className="flex items-center">
			{account ? (
				<WalletConnectButton />
			) : (
				<div className="flex flex-col items-end">
					<WalletConnectButton
						buttonContent={
							<>
								Connect Wallet{" "}
								<span
									className={cn("ml-1", is_landscape ? "inline" : "hidden")}
								>
									(Optional)
								</span>
							</>
						}
						className={cn(
							"border rounded-md",
							is_landscape ? "text-sm px-4 py-2" : "text-xs px-2 py-1",
						)}
					/>
					<span
						className={cn(
							"text-muted-foreground",
							is_landscape ? "text-xs mt-1 block" : "text-[10px] mt-0.5 hidden",
						)}
					>
						Only required for sending SUI
					</span>
				</div>
			)}
		</div>
	);
}
