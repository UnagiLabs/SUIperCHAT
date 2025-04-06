/**
 * ヘッダーウォレットボタンコンポーネント
 *
 * ウォレット接続状態に応じてヘッダーのウォレット接続ボタンの表示・非表示を制御します。
 * ウォレット接続済みの場合のみボタンを表示します。
 *
 * @module components/wallet/header-wallet-button
 */

"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import type React from "react";
import { WalletConnectButton } from "./wallet-connect-button";

/**
 * ヘッダーウォレットボタンコンポーネント
 *
 * @returns {JSX.Element|null} ウォレット接続ボタンまたはnull
 */
export function HeaderWalletButton(): React.ReactElement | null {
	const account = useCurrentAccount();

	if (!account) {
		return null;
	}

	return <WalletConnectButton />;
}
