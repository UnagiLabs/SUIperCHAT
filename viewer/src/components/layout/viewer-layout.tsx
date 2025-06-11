/**
 * 視聴者画面レイアウトコンポーネント
 *
 * 動画埋め込み、コメント表示、スーパーチャット送信フォームを一体化したレイアウトを提供します。
 * 横長（PC）と縦長（スマホ）のそれぞれに最適化されたレスポンシブなレイアウトを実装しています。
 *
 * @remarks
 * - 横長画面では左側70%に動画、右側30%にコメント表示+スーパーチャットフォームを配置
 * - 縦長画面では上から順に動画→コメント表示+スーパーチャットフォームの縦長配置
 * - メディアクエリではなく、アスペクト比（縦横比）に基づいてレイアウトを切り替え
 * - スマホ横画面時は動画とコメント比率を最適化
 *
 * @file 視聴者画面のレイアウトコンポーネントを実装
 */

"use client";

import { WebSocketConnectionStatus } from "@/components/superchat/ws-connection-status";
import { useAspectRatio } from "@/hooks/useAspectRatio";
import { cn } from "@/lib/utils";
import React from "react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

/**
 * ウィンドウサイズを取得するカスタムフック
 * SSRとクライアントで一貫したレンダリング結果を得るため、初期値を調整しています
 *
 * @returns ウィンドウの幅と高さ
 */
function useWindowSize() {
	// ハイドレーションエラーを防ぐため、SSRでは常に初期値を使用
	const [is_client, set_is_client] = useState(false);
	const [window_size, set_window_size] = useState({
		window_width: 1024, // SSRでの初期値をデスクトップサイズに設定
		window_height: 768,
	});

	useEffect(() => {
		// クライアントサイドでのみ実行されるコード
		set_is_client(true);

		function handle_resize() {
			set_window_size({
				window_width: window.innerWidth,
				window_height: window.innerHeight,
			});
		}

		window.addEventListener("resize", handle_resize);
		handle_resize();

		return () => window.removeEventListener("resize", handle_resize);
	}, []);

	// SSRではデフォルト値を返し、クライアントでは実際の値を返す
	return is_client ? window_size : { window_width: 1024, window_height: 768 };
}

/**
 * 視聴者画面レイアウトコンポーネントのプロパティ
 */
interface ViewerLayoutProps {
	/**
	 * 動画プレーヤーコンポーネント
	 */
	video_player: React.ReactNode;

	/**
	 * コメントリストコンポーネント
	 */
	comment_list: React.ReactNode;

	/**
	 * スーパーチャットフォームコンポーネント
	 */
	superchat_form: React.ReactNode;

	/**
	 * コンポーネントのクラス名
	 */
	className?: string;
}

/**
 * Superchatコンポーネントに対応するインターフェース
 */
interface SuperchatComponentProps {
	on_tip_mode_change?: (has_tip: boolean) => void;
	className?: string;
	on_send_success?: (
		amount: number,
		display_name: string,
		message: string,
		transaction_id?: string,
	) => void;
	initial_recipient_address?: string;
	compact_mode?: boolean;
	integrated_ui?: boolean;
	on_height_change?: (height: number) => void;
}

/**
 * 視聴者画面レイアウトコンポーネント
 *
 * 動画・コメント・スーパーチャットフォームを一体化したレイアウトを提供します。
 * 横長と縦長でそれぞれ最適なレイアウトに自動調整されます。
 *
 * @param props - コンポーネントのプロパティ
 * @returns 視聴者画面レイアウトのJSXエレメント
 */
export function ViewerLayout({
	video_player,
	comment_list,
	superchat_form,
	className,
}: ViewerLayoutProps): React.ReactElement {
	// アスペクト比に基づくレイアウトモードを取得
	const { is_landscape } = useAspectRatio({ threshold: 1.0 });
	// 画面幅を取得
	const { window_width, window_height } = useWindowSize();

	// クライアントサイドでのレンダリングかどうかを検出
	const [is_mounted, set_is_mounted] = useState(false);
	useEffect(() => {
		set_is_mounted(true);
	}, []);

	// スマホ横画面かどうかを判定（768px未満をスマホと判定）
	const is_mobile_landscape = is_landscape && window_width < 768;

	// Tipモードの状態
	const [has_tip, set_has_tip] = useState(false);

	// コンテナの参照を作成
	const containerRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLDivElement>(null);
	const commentRef = useRef<HTMLDivElement>(null);
	const headerRef = useRef<HTMLDivElement | null>(null);
	const superchatRef = useRef<HTMLDivElement>(null);
	const commentListRef = useRef<HTMLDivElement>(null);
	const commentWrapperRef = useRef<HTMLDivElement>(null);

	// スーパーチャットエリアの高さ（NoTipモードとデバイスに応じて調整）
	const getSuperchatHeight = useCallback(() => {
		if (!has_tip) {
			// NoTipモードの場合は最小限の高さにする
			return !is_mounted ? 80 : is_mobile_landscape ? 65 : 80;
		}
		// Tipありの場合は通常の高さにする
		return !is_mounted ? 140 : is_mobile_landscape ? 100 : 140;
	}, [has_tip, is_mounted, is_mobile_landscape]);

	// スーパーチャット高さの計算
	const superchatHeight = getSuperchatHeight();
	// テキストエリアの拡張に対応するための追加の高さ
	const [additionalHeight, setAdditionalHeight] = useState(0);

	// テキストエリアの高さ変更を監視する関数
	const handleSuperchatHeightChange = useCallback(
		(height: number) => {
			// 基本の高さからの追加分を計算
			const baseHeight = getSuperchatHeight();
			const additional = Math.max(0, height - baseHeight);
			setAdditionalHeight(additional);
		},
		[getSuperchatHeight],
	);

	// Tipモード変更ハンドラー
	const handleTipModeChange = useCallback((tip_mode: boolean) => {
		set_has_tip(tip_mode);
	}, []);

	// ヘッダー要素を探す
	useLayoutEffect(() => {
		// header要素を取得
		const header = document.querySelector("header") as HTMLDivElement;
		if (header) {
			headerRef.current = header;
		}
	}, []);

	// リサイズや初期レンダリング時にレイアウトを動的に計算
	useEffect(() => {
		// ビューポートの高さを取得するための関数
		const getViewportHeight = () => {
			// 実際のビューポートの高さを取得（モバイルブラウザのUI要素を考慮）
			return window.visualViewport
				? window.visualViewport.height
				: window.innerHeight;
		};

		function updateLayout() {
			// ヘッダーの高さを取得
			const headerHeight = headerRef.current
				? headerRef.current.offsetHeight
				: is_landscape
					? 40
					: 32;

			// メインコンテンツのパディング
			const mainPadding = 8;

			// ビューポートの高さを取得
			const viewportHeight = getViewportHeight();

			// 使用可能な高さを計算（ヘッダーとパディングを引く）
			const availableHeight = viewportHeight - headerHeight - mainPadding;

			if (is_mobile_landscape) {
				// スマホ横画面時は動画とコメントコンテナの高さを同じに
				const containerHeight = `${availableHeight}px`;

				// コンテナの高さをスタイルで設定
				if (videoRef.current) {
					videoRef.current.style.height = containerHeight;
				}

				if (commentRef.current) {
					commentRef.current.style.height = containerHeight;
				}

				// コメントリストの高さを設定（スーパーチャットフォームと区切り線の高さを考慮）
				if (commentWrapperRef.current) {
					// スーパーチャットと区切り線の合計高さ
					const bottomElementsHeight = superchatHeight + 1; // 1pxの区切り線

					// コメントラッパーの高さを計算
					const wrapperHeight = availableHeight - bottomElementsHeight;
					commentWrapperRef.current.style.minHeight = "0";
				}
			} else if (is_landscape) {
				// PC横画面時も同様の計算
				const containerHeight = `${availableHeight}px`;

				if (videoRef.current) {
					videoRef.current.style.height = containerHeight;
				}

				if (commentRef.current) {
					commentRef.current.style.height = containerHeight;
				}

				// コメントリストの高さを設定（スーパーチャットフォームと区切り線の高さを考慮）
				if (commentWrapperRef.current) {
					// スーパーチャットと区切り線の合計高さ
					const bottomElementsHeight = superchatHeight + 1; // 1pxの区切り線

					// コメントラッパーの高さを計算
					const wrapperHeight = availableHeight - bottomElementsHeight;
					commentWrapperRef.current.style.minHeight = "0";
				}
			} else {
				// 縦長画面時の計算
				// 動画の高さを計算（16:9比率を維持）
				const videoWidth = containerRef.current
					? containerRef.current.offsetWidth
					: window_width;
				const videoHeightByRatio = videoWidth * (9 / 16);

				// 動画の高さを設定
				if (videoRef.current) {
					videoRef.current.style.height = `${videoHeightByRatio}px`;
				}

				// 残りのスペースをコメントエリアに割り当て
				const commentContainerHeight = Math.max(
					availableHeight - videoHeightByRatio - 16, // 16はセパレータとマージン用
					superchatHeight + 80, // 最小高さを確保
				);

				// コメントコンテナの高さを設定
				if (commentRef.current) {
					commentRef.current.style.height = `${commentContainerHeight}px`;
				}

				// コメントリストの高さを設定（スーパーチャットフォームと区切り線の高さを考慮）
				if (commentWrapperRef.current) {
					// スーパーチャットと区切り線の合計高さ
					const bottomElementsHeight = superchatHeight + 1; // 1pxの区切り線

					// コメントラッパーの高さを計算
					const wrapperHeight = commentContainerHeight - bottomElementsHeight;
					commentWrapperRef.current.style.minHeight = "0";
				}
			}
		}

		// 初期計算
		updateLayout();

		// ResizeObserverの設定
		const resizeObserver = new ResizeObserver(() => {
			updateLayout();
		});

		// コンテナ要素を監視
		if (containerRef.current) {
			resizeObserver.observe(containerRef.current);
		}

		// ビューポートの変更を監視
		if (window.visualViewport) {
			window.visualViewport.addEventListener("resize", updateLayout);
		}

		// リサイズイベントでも更新
		window.addEventListener("resize", updateLayout);

		return () => {
			if (containerRef.current) {
				resizeObserver.unobserve(containerRef.current);
			}
			resizeObserver.disconnect();

			if (window.visualViewport) {
				window.visualViewport.removeEventListener("resize", updateLayout);
			}
			window.removeEventListener("resize", updateLayout);
		};
	}, [is_landscape, is_mobile_landscape, window_width, superchatHeight]);

	return (
		<div
			ref={containerRef}
			className={cn("w-full max-w-7xl mx-auto h-full flex flex-col", className)}
			style={{ minHeight: "calc(100vh - 60px)" }}
		>
			{/* レイアウトをアスペクト比に基づいて切り替え */}
			<div
				className={cn(
					"flex w-full gap-1 flex-grow box-border",
					is_landscape ? "flex-row" : "flex-col",
				)}
			>
				{/* 動画エリア - デバイスに応じて最適化 */}
				<div
					ref={videoRef}
					className={cn(
						// SSRとクライアント初回レンダリングで一致するよう、SSR時は常にデスクトップ用の値を使用
						!is_mounted
							? "flex-[7_0_0%]"
							: is_mobile_landscape
								? "flex-[6_0_0%]"
								: is_landscape
									? "flex-[7_0_0%]"
									: "w-full",
					)}
				>
					{video_player}
				</div>

				{/* コメントとスーパーチャットの統合エリア - デバイスに応じて最適化 */}
				<div
					ref={commentRef}
					className={cn(
						"border rounded-lg overflow-hidden",
						// SSRとクライアント初回レンダリングで一致するよう、SSR時は常にデスクトップ用の値を使用
						!is_mounted
							? "flex-[3_0_0%]"
							: is_mobile_landscape
								? "flex-[4_0_0%]"
								: is_landscape
									? "flex-[3_0_0%]"
									: "w-full",
					)}
					style={{ display: "flex", flexDirection: "column", height: "100%" }}
				>
					{/* コメントエリア - 残りのスペースを埋める */}
					<div
						ref={commentWrapperRef}
						className="overflow-hidden flex-grow"
						style={{ flex: "1 1 auto", minHeight: "0" }}
					>
						{comment_list}
					</div>

					{/* 区切り線 */}
					<div className="border-t border-border/40 my-0.5" />

					{/* スーパーチャットエリア - 高さを固定して下部に配置 */}
					<div
						ref={superchatRef}
						className="w-full flex-shrink-0"
						style={{
							minHeight: `${superchatHeight}px`,
							height: `${superchatHeight + additionalHeight}px`,
							flex: "0 0 auto",
						}}
					>
						{React.isValidElement(superchat_form)
							? React.cloneElement(
									superchat_form as React.ReactElement<SuperchatComponentProps>,
									{
										on_tip_mode_change: handleTipModeChange,
										on_height_change: handleSuperchatHeightChange,
									},
								)
							: superchat_form}
					</div>
				</div>
			</div>

			{/* WebSocket接続状態インジケーター */}
			<WebSocketConnectionStatus />
		</div>
	);
}
