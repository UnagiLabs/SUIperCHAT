/**
 * WebSocketテストページ
 *
 * WebSocketの接続・通信テストを行うためのページです。
 * 開発用として使用し、WebSocketの接続状態表示や
 * メッセージ送信機能をテストすることができます。
 * このページはメッセージの送信テスト専用であり、受信メッセージの表示機能はありません。
 *
 * @module app/websocket-test/page
 */

"use client";

import { useWebSocket } from "@/components/providers/WebSocketProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConnectionStatus } from "@/lib/types/websocket";
import { useCallback, useState } from "react";

/**
 * WebSocketテストページコンポーネント
 *
 * @returns {JSX.Element} WebSocketテストページ
 */
export default function WebSocketTestPage() {
	const { state, actions } = useWebSocket();
	const [url, set_url] = useState("ws://127.0.0.1:8080/ws"); // デフォルトURL
	const [display_name, set_display_name] = useState("");
	const [message, set_message] = useState("");

	/**
	 * 接続ボタンハンドラ
	 */
	const handle_connect = useCallback(() => {
		actions.connect(url);
	}, [actions, url]);

	/**
	 * 切断ボタンハンドラ
	 */
	const handle_disconnect = useCallback(() => {
		actions.disconnect();
	}, [actions]);

	/**
	 * メッセージ送信ハンドラ
	 */
	const handle_send_message = useCallback(
		(e: React.FormEvent<HTMLFormElement>) => {
			e.preventDefault();
			if (message.trim() && display_name.trim()) {
				// ここでは簡単のためチャットメッセージのみ送信
				actions.sendChatMessage(display_name, message);
				set_message(""); // 送信後に入力欄をクリア
			}
		},
		[actions, display_name, message],
	);

	return (
		<div className="container mx-auto p-4">
			<Card className="w-full max-w-2xl mx-auto">
				<CardHeader>
					<CardTitle>WebSocket テスト</CardTitle>
					<div className="flex items-center space-x-2">
						<Input
							placeholder="WebSocket URL (例: ws://127.0.0.1:8080/ws)"
							value={url}
							onChange={(e) => set_url(e.target.value)}
							disabled={
								state.status === ConnectionStatus.CONNECTED ||
								state.status === ConnectionStatus.CONNECTING
							}
						/>
						<Button
							onClick={handle_connect}
							disabled={
								state.status === ConnectionStatus.CONNECTED ||
								state.status === ConnectionStatus.CONNECTING
							}
						>
							接続
						</Button>
						<Button
							variant="destructive"
							onClick={handle_disconnect}
							disabled={state.status !== ConnectionStatus.CONNECTED}
						>
							切断
						</Button>
					</div>
					<div className="mt-2">
						<Badge
							variant={
								state.status === ConnectionStatus.CONNECTED
									? "default"
									: "secondary"
							}
						>
							状態: {state.status}
						</Badge>
						{state.error && (
							<Badge variant="destructive" className="ml-2">
								エラー: {state.error}
							</Badge>
						)}
					</div>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						このページではメッセージの受信・表示は行いません。
					</p>
				</CardContent>
				<CardFooter>
					<form
						onSubmit={handle_send_message}
						className="flex w-full items-center space-x-2"
					>
						<Input
							placeholder="表示名"
							value={display_name}
							onChange={(e) => set_display_name(e.target.value)}
							disabled={state.status !== ConnectionStatus.CONNECTED}
							className="w-32"
						/>
						<Input
							placeholder="メッセージを入力..."
							value={message}
							onChange={(e) => set_message(e.target.value)}
							disabled={state.status !== ConnectionStatus.CONNECTED}
						/>
						<Button
							type="submit"
							disabled={
								state.status !== ConnectionStatus.CONNECTED ||
								!message.trim() ||
								!display_name.trim()
							}
						>
							送信
						</Button>
					</form>
				</CardFooter>
			</Card>
		</div>
	);
}
