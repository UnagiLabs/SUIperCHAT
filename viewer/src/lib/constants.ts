/**
 * Suiコントラクト関連の定数
 *
 * Suiブロックチェーンとのインタラクションに必要な定数を定義します。
 * パッケージID、設定ID、型引数、単位変換などの基本的な値を含みます。
 *
 * @module constants
 */

/**
 * SUIperChatスマートコントラクトのパッケージID
 */
export const PACKAGE_ID =
	"0x35e27980d6195441e4b9ae3750debff967462d3d2bff36c052b41b4cf4292258";

/**
 * 支払い設定オブジェクトのID
 */
export const PAYMENT_CONFIG_ID =
	"0x0ab53f74c6f40a6fe790689475c2546e549ffdcb7af77068ada4e459a1518599";

/**
 * SUI通貨の型引数
 */
export const SUI_TYPE_ARG = "0x2::sui::SUI";

/**
 * SUIからMISTへの変換係数 (1 SUI = 10^9 MIST)
 */
export const SUI_TO_MIST = 1_000_000_000n;

/**
 * デフォルトのガス予算 (0.02 SUI = 20,000,000 MIST)
 */
export const DEFAULT_GAS_BUDGET = 20_000_000n;
