/**
 * アスペクト比検出カスタムフック
 *
 * 現在のウィンドウのアスペクト比を監視し、横長レイアウト（PC）と
 * 縦長レイアウト（スマホ）を判別するためのフックです。
 *
 * @remarks
 * - ウィンドウのリサイズを監視し、アスペクト比に基づいてレイアウトモードを返します
 * - 横長の場合は「landscape」（横向き）、縦長の場合は「portrait」（縦向き）を返します
 *
 * @returns レイアウトモード（'landscape' または 'portrait'）と現在のアスペクト比
 */

"use client";

import { useEffect, useState } from "react";

/**
 * レイアウトモードの種類
 */
export type LayoutMode = "landscape" | "portrait";

/**
 * アスペクト比検出フックの戻り値の型
 */
interface AspectRatioResult {
	/**
	 * 現在のレイアウトモード（横長=landscape、縦長=portrait）
	 */
	mode: LayoutMode;

	/**
	 * 現在のアスペクト比（幅 / 高さ）
	 */
	ratio: number;

	/**
	 * 横長レイアウトかどうか
	 */
	is_landscape: boolean;

	/**
	 * 縦長レイアウトかどうか
	 */
	is_portrait: boolean;
}

/**
 * アスペクト比検出フックのオプション
 */
interface UseAspectRatioOptions {
	/**
	 * 横長と判定する境界値（デフォルト: 1.0）
	 * この値以上ならlandscape、未満ならportrait
	 */
	threshold?: number;
}

/**
 * アスペクト比を検出し、レイアウトモードを返すカスタムフック
 *
 * @param options - フックのオプション設定
 * @returns アスペクト比情報と現在のレイアウトモード
 */
export function useAspectRatio(
	options: UseAspectRatioOptions = {},
): AspectRatioResult {
	// デフォルト値の設定
	const { threshold = 1.0 } = options;

	// 状態の初期化（SSRでのエラー回避のため初期値を設定）
	const [aspectRatio, set_aspect_ratio] = useState<number>(1.5); // デフォルト値は横長想定

	// クライアントサイドでのみ実行
	useEffect(() => {
		// 初期値の設定
		calculate_aspect_ratio();

		// リサイズイベントのリスナー
		function handle_resize() {
			calculate_aspect_ratio();
		}

		// アスペクト比の計算
		function calculate_aspect_ratio() {
			const ratio = window.innerWidth / window.innerHeight;
			set_aspect_ratio(ratio);
		}

		// リサイズイベントのリスナー登録
		window.addEventListener("resize", handle_resize);

		// クリーンアップ
		return () => {
			window.removeEventListener("resize", handle_resize);
		};
	}, []);

	// アスペクト比に基づいてモードを判定
	const mode: LayoutMode = aspectRatio >= threshold ? "landscape" : "portrait";

	// 結果オブジェクトを返す
	return {
		mode,
		ratio: aspectRatio,
		is_landscape: mode === "landscape",
		is_portrait: mode === "portrait",
	};
}
