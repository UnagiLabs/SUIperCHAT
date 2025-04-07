/**
 * Tauri IPC通信ユーティリティ
 * 
 * フロントエンドからTauriのRustバックエンドを呼び出すための
 * ユーティリティ関数を提供します。
 * 
 * @module lib/utils/tauri
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * バックエンドからの挨拶メッセージを取得
 * 
 * @param {string} name - 挨拶する相手の名前
 * @returns {Promise<{message: string, timestamp: number}>} 挨拶メッセージと時刻
 */
export async function greet(name: string): Promise<{message: string, timestamp: number}> {
    try {
        return await invoke('greet', { name });
    } catch (error) {
        console.error('挨拶の取得に失敗しました:', error);
        throw new Error(`挨拶の取得に失敗しました: ${error}`);
    }
}

/**
 * アプリケーションのバージョン情報を取得
 * 
 * @returns {Promise<{version: string, build_id: string, build_date: string}>} バージョン情報
 */
export async function getAppVersion(): Promise<{
    version: string, 
    build_id: string, 
    build_date: string
}> {
    try {
        return await invoke('get_app_version');
    } catch (error) {
        console.error('バージョン情報の取得に失敗しました:', error);
        throw new Error(`バージョン情報の取得に失敗しました: ${error}`);
    }
}

/**
 * WebSocketサーバーを起動
 * 
 * @param {Object} options - サーバー起動オプション
 * @param {number} [options.port=8080] - サーバーポート
 * @param {string} [options.host='localhost'] - サーバーホスト
 * @returns {Promise<{is_running: boolean, port?: number, host?: string, message: string}>} サーバー状態
 */
export async function startServer(options?: {
    port?: number;
    host?: string;
}): Promise<{
    is_running: boolean; 
    port?: number; 
    host?: string; 
    message: string;
}> {
    try {
        return await invoke('start_server', options || {});
    } catch (error) {
        console.error('サーバーの起動に失敗しました:', error);
        throw new Error(`サーバーの起動に失敗しました: ${error}`);
    }
}

/**
 * WebSocketサーバーを停止
 * 
 * @returns {Promise<{is_running: boolean, message: string}>} サーバー状態
 */
export async function stopServer(): Promise<{
    is_running: boolean;
    message: string;
}> {
    try {
        return await invoke('stop_server');
    } catch (error) {
        console.error('サーバーの停止に失敗しました:', error);
        throw new Error(`サーバーの停止に失敗しました: ${error}`);
    }
} 