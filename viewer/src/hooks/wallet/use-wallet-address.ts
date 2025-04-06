/**
 * ウォレットアドレス取得フック
 * 
 * 現在接続されているウォレットのアドレスを取得するためのカスタムフックです。
 * 接続されていない場合はnullを返します。
 * 
 * @module hooks/wallet/use-wallet-address
 */

"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";

/**
 * ウォレットアドレスを取得するフック
 * 
 * @returns {string|null} 接続されているウォレットのアドレス、接続されていない場合はnull
 */
export function useWalletAddress(): string | null {
    const account = useCurrentAccount();
    
    if (!account) {
        return null;
    }
    
    return account.address;
} 