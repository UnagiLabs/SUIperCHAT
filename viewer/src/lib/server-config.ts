/**
 * サーバー設定ユーティリティ
 * 
 * 環境変数からサーバー設定情報を取得するユーティリティ関数を提供します。
 * 
 * @remarks
 * - 配信URL、ウォレットアドレスなどの設定を環境変数から取得
 * - デフォルト値のフォールバック機能
 * 
 * @file サーバー設定取得のためのユーティリティ
 */

/**
 * サーバー設定の型定義
 */
export interface ServerConfig {
    /**
     * 配信URL
     */
    streamUrl?: string;
    
    /**
     * 配信者のウォレットアドレス
     */
    walletAddress?: string;
    
    /**
     * WebSocketサーバーのURL
     */
    wsUrl?: string;
    
    /**
     * その他の設定
     */
    [key: string]: string | undefined;
}

/**
 * サーバー設定を取得する
 * 
 * 環境変数から設定情報を取得し、ServerConfig形式で返します。
 * 
 * @returns サーバー設定オブジェクト
 */
export async function getServerConfig(): Promise<ServerConfig> {
    // 設定オブジェクトを初期化
    const config: ServerConfig = {
        // 配信URL (YouTube LiveなどのURL)
        streamUrl: process.env.NEXT_PUBLIC_STREAM_URL,
        
        // 配信者のウォレットアドレス
        walletAddress: process.env.NEXT_PUBLIC_WALLET_ADDRESS,
        
        // WebSocketサーバーのURL
        wsUrl: process.env.NEXT_PUBLIC_WS_URL || "wss://example.com/ws",
    };
    
    return config;
} 