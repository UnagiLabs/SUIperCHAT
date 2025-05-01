use std::env;
use std::path::Path;

fn main() {
    println!("cargo:warning=build.rs started"); // 開始確認

    // Windows ターゲットのときだけ試す
    if env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "windows" {
        println!("cargo:warning=Running Npcap check for Windows...");
        let on_ci = env::var("GITHUB_ACTIONS").is_ok();
        println!("cargo:warning=On CI: {}", on_ci);

        match env::var("NPCAP_LIB_PATH") {
            Ok(sdk_path) => {
                // ★ 環境変数の値そのものをログに出力
                println!("cargo:warning=Raw NPCAP_LIB_PATH env var value: '{}'", sdk_path);

                let sdk_path_trimmed = sdk_path.trim(); // 前後の空白を削除してみる
                println!("cargo:warning=Trimmed NPCAP_LIB_PATH: '{}'", sdk_path_trimmed);

                let sdk_path_obj = Path::new(sdk_path_trimmed);

                if sdk_path_obj.is_absolute() {
                     println!("cargo:warning=Path is absolute: '{}'", sdk_path_obj.display());
                } else {
                     println!("cargo:warning=Path is NOT absolute: '{}'", sdk_path_obj.display());
                     // 必要なら絶対パスに変換する処理を追加検討
                }

                if sdk_path_obj.exists() {
                     println!("cargo:warning=Path check: Directory or file exists at '{}'", sdk_path_obj.display());
                     if sdk_path_obj.is_dir() {
                         println!("cargo:warning=Path check: It is a directory.");

                         // ★ リンカへの指示を出力
                         println!("cargo:rustc-link-search=native={}", sdk_path_trimmed);
                         println!("cargo:rustc-link-lib=static=Packet");
                         println!("cargo:warning=Instruction sent: rustc-link-search=native={}", sdk_path_trimmed);
                         println!("cargo:warning=Instruction sent: rustc-link-lib=static=Packet");

                         // ライブラリファイルの存在確認
                         let lib_file_64 = sdk_path_obj.join("Packet.x64.lib");
                         let lib_file_32 = sdk_path_obj.join("Packet.lib");
                         if lib_file_64.exists() {
                             println!("cargo:warning=Found Packet.x64.lib at: {}", lib_file_64.display());
                         } else if lib_file_32.exists() {
                             println!("cargo:warning=Found Packet.lib at: {}", lib_file_32.display());
                         } else {
                             println!("cargo:warning=Neither Packet.x64.lib nor Packet.lib found in {}", sdk_path_trimmed);
                         }
                     } else {
                         println!("cargo:warning=Path check: It is NOT a directory.");
                         if on_ci {
                             panic!("NPCAP_LIB_PATH '{}' exists but is not a directory in CI", sdk_path_trimmed);
                         }
                     }
                } else {
                     println!("cargo:warning=Path check: Directory or file does NOT exist at '{}'", sdk_path_obj.display());
                     if on_ci {
                         panic!("NPCAP_LIB_PATH directory '{}' does not exist in CI", sdk_path_trimmed);
                     }
                }
            }
            Err(e) => {
                println!("cargo:warning=NPCAP_LIB_PATH environment variable not found: {}", e);
                if on_ci {
                    panic!("NPCAP_LIB_PATH must be set in CI for Windows builds");
                } else {
                    println!("cargo:warning=Skipping Npcap linkage as NPCAP_LIB_PATH is not set locally.");
                }
            }
        }
    } else {
         println!("cargo:warning=Not building on Windows, skipping Npcap check.");
    }

    println!("cargo:warning=Running tauri_build::build()..."); // Tauriビルド実行前確認
    tauri_build::build();
    println!("cargo:warning=tauri_build::build() finished."); // Tauriビルド実行後確認
    println!("cargo:warning=build.rs finished"); // 終了確認
}
