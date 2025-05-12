/**
 * ウォレット接続ボタンコンポーネント
 *
 * SUIウォレットとの接続・切断を行うボタンを提供します。
 * ユーザーがウォレットを接続していない場合は「ウォレット接続」ボタンを表示し、
 * 接続済みの場合は切断オプションを含むボタンを表示します。
 *
 * @module components/wallet/wallet-connect-button
 */

"use client";

import { ConnectButton } from "@mysten/dapp-kit";
import type React from "react";

/**
 * ウォレット接続ボタンコンポーネントのプロパティ
 */
interface WalletConnectButtonProps {
	/**
	 * コンポーネントのクラス名
	 */
	className?: string;

	/**
	 * ボタンの内容をカスタマイズするためのReactノード
	 */
	buttonContent?: React.ReactNode;

	/**
	 * ボタンのプロパティ
	 */
	buttonProps?: React.ComponentProps<typeof ConnectButton>;
}

/**
 * ウォレット接続ボタンコンポーネント
 *
 * @param {WalletConnectButtonProps} props - コンポーネントプロパティ
 * @returns {JSX.Element} ウォレット接続ボタン
 */
export function WalletConnectButton({
	className = "",
	buttonContent,
	buttonProps,
}: WalletConnectButtonProps): React.ReactElement {
	return (
		<div className={`wallet-connect-wrapper ${className}`}>
			<ConnectButton
				connectText={buttonContent ? undefined : "Connect Wallet"}
				{...buttonProps}
			>
				{buttonContent}
			</ConnectButton>
		</div>
	);
}
