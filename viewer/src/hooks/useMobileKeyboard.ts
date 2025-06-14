/**
 * モバイルキーボード表示状態を管理するカスタムフック
 *
 * visualViewport APIを使用してキーボードの表示/非表示とその高さを検知します。
 * iOS/Android両方に対応し、キーボード表示時の適切なレイアウト調整を可能にします。
 */

"use client";

import { useCallback, useEffect, useState } from "react";

interface MobileKeyboardState {
	/**
	 * キーボードが表示されているかどうか
	 */
	isKeyboardVisible: boolean;
	/**
	 * キーボードの高さ（px）
	 */
	keyboardHeight: number;
	/**
	 * ビューポートの高さ（キーボード分を除いた表示領域）
	 */
	viewportHeight: number;
}

/**
 * モバイルキーボードの状態を管理するカスタムフック
 *
 * @returns キーボードの表示状態と高さ情報
 */
export function useMobileKeyboard(): MobileKeyboardState {
	const [keyboardState, setKeyboardState] = useState<MobileKeyboardState>({
		isKeyboardVisible: false,
		keyboardHeight: 0,
		viewportHeight: typeof window !== "undefined" ? window.innerHeight : 0,
	});

	const updateKeyboardState = useCallback(() => {
		if (typeof window === "undefined") return;

		// visualViewport APIが利用可能かチェック
		if (window.visualViewport) {
			const viewport = window.visualViewport;
			const windowHeight = window.innerHeight;
			const viewportHeight = viewport.height;
			const keyboardHeight = windowHeight - viewportHeight;

			// iOS SafariとAndroidの判定を改善
			// 閾値を下げてより正確な検出を実現
			const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
			const threshold = isIOS ? 100 : 50;

			// キーボードの高さが閾値以上の場合をキーボード表示と判定
			const isKeyboardVisible = keyboardHeight > threshold;

			// デバッグ用（開発環境のみ）
			if (process.env.NODE_ENV === "development") {
				console.log("Keyboard state:", {
					windowHeight,
					viewportHeight,
					keyboardHeight,
					threshold,
					isKeyboardVisible,
				});
			}

			setKeyboardState({
				isKeyboardVisible,
				keyboardHeight: isKeyboardVisible ? keyboardHeight : 0,
				viewportHeight,
			});
		} else {
			// visualViewport APIが利用できない場合のフォールバック
			// （古いブラウザ対応）
			setKeyboardState({
				isKeyboardVisible: false,
				keyboardHeight: 0,
				viewportHeight: window.innerHeight,
			});
		}
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;

		// 初期状態を設定
		updateKeyboardState();

		// visualViewport APIのイベントリスナーを設定
		if (window.visualViewport) {
			window.visualViewport.addEventListener("resize", updateKeyboardState);
		}

		// フォールバック用のresizeリスナー
		window.addEventListener("resize", updateKeyboardState);

		return () => {
			if (window.visualViewport) {
				window.visualViewport.removeEventListener(
					"resize",
					updateKeyboardState,
				);
			}
			window.removeEventListener("resize", updateKeyboardState);
		};
	}, [updateKeyboardState]);

	return keyboardState;
}
