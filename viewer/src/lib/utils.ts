/**
 * ユーティリティ関数モジュール
 *
 * アプリケーション全体で使用される汎用的なユーティリティ関数を提供します。
 *
 * @module utils
 */

type ClassValue =
	| string
	| Record<string, boolean>
	| null
	| undefined
	| ClassValue[];

/**
 * クラス名を条件付きで結合するユーティリティ関数
 *
 * @param {...ClassValue[]} inputs - クラス名または条件付きクラス名のオブジェクト
 * @returns {string} - 結合されたクラス名
 */
export function cn(...inputs: ClassValue[]): string {
	return inputs
		.flatMap((item) => {
			if (typeof item === "string") {
				return item.trim();
			}

			if (typeof item === "object" && item !== null && !Array.isArray(item)) {
				return Object.entries(item)
					.filter(([, value]) => Boolean(value))
					.map(([key]) => key.trim());
			}

			if (Array.isArray(item)) {
				return cn(...item);
			}

			return [];
		})
		.filter(Boolean)
		.join(" ");
}

/**
 * 与えられた値を指定された範囲内に制限する関数
 *
 * @param {number} value - 制限する値
 * @param {number} min - 最小値
 * @param {number} max - 最大値
 * @returns {number} - 制限された値
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/**
 * デバイスの種類を判定する関数
 *
 * @returns {Object} デバイス判定結果のオブジェクト
 */
export function get_device_type() {
	const is_client = typeof window !== "undefined";

	if (!is_client) {
		return {
			is_mobile: false,
			is_tablet: false,
			is_desktop: true,
		};
	}

	const is_mobile = window.matchMedia("(max-width: 640px)").matches;
	const is_tablet = window.matchMedia(
		"(min-width: 641px) and (max-width: 1024px)",
	).matches;
	const is_desktop = window.matchMedia("(min-width: 1025px)").matches;

	return {
		is_mobile,
		is_tablet,
		is_desktop,
	};
}

/**
 * 指定されたミリ秒だけ待機するPromiseを返す関数
 *
 * @param {number} ms - 待機するミリ秒
 * @returns {Promise<void>} - 指定時間後に解決するPromise
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
