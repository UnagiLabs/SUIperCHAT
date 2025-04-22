/**
 * ユーティリティ関数モジュール
 *
 * アプリケーション全体で使用される汎用的なユーティリティ関数を提供します。
 *
 * @module utils
 */

import { SUI_TO_MIST } from "./constants";

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

/**
 * SUI通貨をMIST単位に変換する関数 (BigInt対応)
 *
 * @param {bigint | number} sui - SUI単位の金額 (整数を想定)
 * @returns {bigint} - MIST単位に変換された金額
 * @remarks 小数点を含むSUIを正確に扱いたい場合は、専用のライブラリ(Decimal.jsなど)の使用や、MIST単位での入力を検討してください。
 */
export function suiToMist(sui: bigint | number): bigint {
	// number型の場合は整数であることを前提とする（もしくはエラーハンドリングを追加）
	if (typeof sui === "number" && !Number.isInteger(sui)) {
		console.warn(
			"suiToMist received a non-integer number. Potential precision loss.",
		);
		// 必要であればエラーをスローするか、丸める処理を追加
		// throw new Error("Input must be an integer or BigInt");
	}
	return BigInt(sui) * SUI_TO_MIST;
}

/**
 * MIST単位をSUI通貨に変換する関数 (表示用)
 *
 * @param {bigint} mist - MIST単位の金額
 * @returns {number} - SUI単位に変換された金額 (表示用、精度に注意)
 * @remarks BigIntからNumberへの変換は、Number.MAX_SAFE_INTEGERを超える場合に精度が失われる可能性があります。主に表示用途に使用してください。
 */
export function mistToSui(mist: bigint): number {
	if (mist === BigInt(0)) return 0; // 0n を BigInt(0) に変更
	// BigIntのまま除算し、最後にNumberに変換することで精度損失を最小限に抑える
	// ただし、最終的なNumber変換で非常に大きな値は精度を失う可能性がある
	const suiValue = Number(mist) / Number(SUI_TO_MIST);
	// 必要に応じて小数点以下の桁数を調整する場合はここで処理
	return suiValue;
	// 例: 小数点以下9桁まで考慮する場合
	// const suiString = (mist / SUI_TO_MIST).toString() + '.' + (mist % SUI_TO_MIST).toString().padStart(9, '0');
	// return parseFloat(suiString);
}
