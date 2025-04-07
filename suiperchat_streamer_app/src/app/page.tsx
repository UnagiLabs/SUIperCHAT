/**
 * SUIperCHAT ホームページコンポーネント
 *
 * アプリケーションのメインページを提供します。
 * Tauri IPCの基本的なデモを含みます。
 *
 * @module app/page
 */

import TauriDemo from "@/components/TauriDemo";

/**
 * ホームページコンポーネント
 *
 * @returns {React.ReactNode} ホームページのレンダリング結果
 */
export default function Home() {
	return (
		<div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
			<main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
				<div className="flex flex-col items-center mb-8">
					<h1 className="text-3xl font-bold mb-2">SUIperCHAT</h1>
					<p className="text-gray-600 dark:text-gray-400">
						配信者向けSUIスーパーチャットアプリ
					</p>
				</div>

				{/* Tauri IPC通信デモコンポーネント */}
				<div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
					<h2 className="text-xl font-semibold mb-4">Tauri IPC デモ</h2>
					<TauriDemo />
				</div>

				<div className="flex gap-4 items-center flex-col sm:flex-row mt-8">
					<a
						className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto"
						href="https://github.com/yourusername/suiperchat"
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub
					</a>
					<a
						className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto"
						href="https://sui.io/"
						target="_blank"
						rel="noopener noreferrer"
					>
						SUI について
					</a>
				</div>
			</main>
			<footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
				<a
					className="flex items-center gap-2 hover:underline hover:underline-offset-4"
					href="https://tauri.app/"
					target="_blank"
					rel="noopener noreferrer"
				>
					Tauri App
				</a>
				<a
					className="flex items-center gap-2 hover:underline hover:underline-offset-4"
					href="https://nextjs.org/"
					target="_blank"
					rel="noopener noreferrer"
				>
					Next.js
				</a>
				<a
					className="flex items-center gap-2 hover:underline hover:underline-offset-4"
					href="https://sui.io/"
					target="_blank"
					rel="noopener noreferrer"
				>
					SUI →
				</a>
			</footer>
		</div>
	);
}
