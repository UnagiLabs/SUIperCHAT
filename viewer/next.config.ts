import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// package.json のパスを取得
const packageJsonPath = path.resolve(__dirname, "package.json");
// package.json を読み込み
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const nextConfig: NextConfig = {
	/* config options here */
	env: {
		NEXT_PUBLIC_APP_VERSION: packageJson.version,
	},
};

export default nextConfig;
