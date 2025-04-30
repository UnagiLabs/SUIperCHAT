use std::env;

fn main() {
    // Windows ターゲットのときだけ試す
    if env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "windows" {
        // CI（GitHub Actions）上なら GITHUB_ACTIONS が set されているはず
        let on_ci = env::var("GITHUB_ACTIONS").is_ok();
        // CI 上のみ必須、それ以外（ローカル）は任意
        if let Ok(sdk_path) = env::var("NPCAP_LIB_PATH") {
            println!("cargo:rustc-link-search=native={}", sdk_path);
            println!("cargo:rustc-link-lib=static=Packet");
        } else if on_ci {
            panic!("NPCAP_LIB_PATH must be set in CI for Windows builds");
        } else {
            // ローカル Windows ビルドで環境変数が無くてもスキップ
            println!("cargo:warning=NPCAP_LIB_PATH not set; skipping Npcap linkage");
        }
    }

    // Tauri 本来のビルド処理
    tauri_build::build();
}
