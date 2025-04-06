/**
 * ウォレット情報表示コンポーネント
 *
 * 接続されているウォレットの情報（アドレスなど）を表示するコンポーネントです。
 * ウォレットが接続されている場合のみ表示されます。
 *
 * @module components/wallet/wallet-info
 */

"use client";

import { useWalletAddress } from "@/hooks/wallet/use-wallet-address";
import { useCurrentAccount } from "@mysten/dapp-kit";
import type React from "react";

/**
 * ウォレット情報表示コンポーネントのプロパティ
 */
interface WalletInfoProps {
	className?: string;
}

/**
 * ウォレット情報表示コンポーネント
 *
 * @param {WalletInfoProps} props - コンポーネントプロパティ
 * @returns {JSX.Element|null} ウォレット情報表示、接続されていない場合はnull
 */
export function WalletInfo({
	className = "",
}: WalletInfoProps): React.ReactElement | null {
	const account = useCurrentAccount();
	const address = useWalletAddress();

	if (!account || !address) {
		return null;
	}

	return (
		<div className={`wallet-info ${className}`}>
			<p className="text-sm text-muted-foreground mb-1">Connected Wallet</p>
			<p className="font-mono text-xs break-all">{address}</p>
		</div>
	);
}
