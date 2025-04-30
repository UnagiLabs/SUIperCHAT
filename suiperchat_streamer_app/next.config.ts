import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */

// tauri.conf.jsonからバージョンを読み込む
const tauriConfPath = path.join(__dirname, "src-tauri", "tauri.conf.json");
const tauriConfContent = fs.readFileSync(tauriConfPath, "utf8");
const tauriConf = JSON.parse(tauriConfContent);
const appVersion = tauriConf.version;

const nextConfig = {
	// 静的エクスポートの設定
	output: "export",
	// 画像の最適化を無効化（静的エクスポートに必要）
	images: {
		unoptimized: true,
	},
	// 環境変数としてバージョンを設定
	env: {
		NEXT_PUBLIC_APP_VERSION: appVersion,
	},
};

export default nextConfig;
