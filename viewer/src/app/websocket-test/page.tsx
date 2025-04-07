/**
 * WebSocketテストページ
 *
 * WebSocketの接続・通信テストを行うためのページです。
 * 開発用として使用し、WebSocketの接続状態表示や
 * メッセージ送信機能をテストすることができます。
 *
 * @module app/websocket-test/page
 */

import { WebSocketMessage } from "@/components/websocket/WebSocketMessage";
import { WebSocketMessageDisplay } from "@/components/websocket/WebSocketMessageDisplay";
import { WebSocketStatus } from "@/components/websocket/WebSocketStatus";

/**
 * WebSocketテストページコンポーネント
 *
 * @returns {JSX.Element} WebSocketテストページ
 */
export default function WebSocketTestPage(): React.ReactElement {
	return (
		<div className="flex justify-center min-h-screen">
			<div className="w-full max-w-7xl px-4 sm:px-6 py-8">
				<h1 className="text-3xl font-bold mb-6 text-center">WebSocketテスト</h1>

				{/* テスト手順 - モバイルでは上部に表示 */}
				<div className="lg:hidden mb-8 p-6 border rounded mx-auto dark:border-gray-700 dark:bg-gray-800/50 bg-gray-50">
					<h2 className="text-lg font-medium mb-3">テスト手順</h2>
					<ol className="list-decimal list-inside space-y-1 text-sm">
						<li>接続状態から「接続」をクリックしてWebSocket接続を開始</li>
						<li>メッセージ送信フォームから送信テスト</li>
						<li>スーパーチャット金額を選択してスパチャメッセージを送信</li>
						<li>メッセージ履歴エリアで受信を確認</li>
					</ol>
				</div>

				{/* メインコンテンツ */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<div className="flex flex-col gap-8">
						<WebSocketStatus defaultUrl="ws://localhost:8080" />
						<WebSocketMessage walletAddress="0x1234567890abcdef1234567890abcdef12345678" />
					</div>

					<div>
						<WebSocketMessageDisplay />
					</div>
				</div>

				{/* テスト手順 - デスクトップでは下部に表示 */}
				<div className="hidden lg:block mt-12 p-6 border rounded mx-auto dark:border-gray-700 dark:bg-gray-800/50 bg-gray-50">
					<h2 className="text-lg font-medium mb-4">テスト手順</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<ol className="list-decimal list-inside space-y-2">
								<li>接続状態から「接続」をクリックしてWebSocket接続を開始</li>
								<li>メッセージ送信フォームから送信テスト</li>
								<li>スーパーチャット金額を選択してスパチャメッセージを送信</li>
								<li>メッセージ履歴エリアで受信を確認</li>
							</ol>
						</div>

						<div className="text-sm text-gray-600 dark:text-gray-400">
							<p className="font-medium mb-2">注意事項:</p>
							<ul className="list-disc list-inside space-y-1">
								<li>テスト用WebSocketサーバーが必要です</li>
								<li>実際のSUI送金は行われません</li>
								<li>テスト用トランザクションハッシュが自動生成されます</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
