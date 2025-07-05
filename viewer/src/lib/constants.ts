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
 * コイン情報のインターフェース
 *
 * @property symbol - コインのシンボル（例: "SUI", "USDC"）
 * @property typeArg - コインの型引数
 * @property decimals - コインの小数点以下の桁数（例: SUIは9桁、USDCは6桁）
 */
export interface CoinInfo {
	symbol: string;
	typeArg: string;
	decimals: number;
}

/**
 * サポートされているコインのリスト
 */
export const SUPPORTED_COINS: CoinInfo[] = [
	{
		symbol: "SUI",
		typeArg: "0x2::sui::SUI",
		decimals: 9,
	},
	{
		symbol: "USDC",
		typeArg:
			"0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
		decimals: 6,
	},
	{
		symbol: "WAL",
		typeArg:
			"0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
		decimals: 9,
	},
	// 今後、他のCoinもここに追加
];

/**
 * デフォルトのガス予算 (0.02 SUI = 20,000,000 MIST)
 */
export const DEFAULT_GAS_BUDGET = BigInt(20_000_000);
