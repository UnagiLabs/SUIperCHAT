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
								<span className="text-xs ml-1 hidden sm:inline">
									(Optional)
								</span>
							</>
						}
						className="text-xs md:text-sm border rounded-md px-2 md:px-4 py-1 md:py-2"
					/>
					<span className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1 hidden sm:block">
						Only required for sending SUI
					</span>
				</div>
			)}
		</div>
	);
}
