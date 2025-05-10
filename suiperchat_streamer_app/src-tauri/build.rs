use std::env;
use std::path::PathBuf;

fn main() {
    // 環境変数 NPCAP_LIB_PATH を取得
    // Windows ターゲットでのみ実行する (他のOSでは不要なため)
    if cfg!(target_os = "windows") {
        if let Ok(npcap_path_str) = env::var("NPCAP_LIB_PATH") {
            let npcap_path = PathBuf::from(npcap_path_str);
            // パスが存在するか確認
            if npcap_path.exists() && npcap_path.is_dir() {
                // リンカーにライブラリ検索パスを指示
                println!("cargo:rustc-link-search=native={}", npcap_path.display());
                println!("cargo:rerun-if-env-changed=NPCAP_LIB_PATH"); // 環境変数が変わったら再実行
                println!("cargo:rerun-if-changed=build.rs"); // このファイルが変わったら再実行
                                                             // デバッグメッセージ（GitHub Actionsのログで確認できる）
                eprintln!(
                    "✅ Added Npcap SDK link search path: {}",
                    npcap_path.display()
                );

                // Packet.lib と wpcap.lib をリンクするように指示
                // (依存クレートが既に行っている可能性もあるが、念のため追加)
                // ※ pnet クレート等が既に link指示を出している場合、重複する可能性あり。
                //   エラーが解消しない場合や別のリンカーエラーが出た場合はコメントアウトも検討。
                // println!("cargo:rustc-link-lib=dylib=Packet");
                // println!("cargo:rustc-link-lib=dylib=wpcap");
            } else {
                // パスが存在しない場合のエラーメッセージ
                panic!("❌ NPCAP_LIB_PATH environment variable points to a non-existent or non-directory path: {}. Please check the path in your workflow file.", npcap_path.display());
            }
        } else {
            // 環境変数が設定されていない場合のエラーメッセージ
            panic!("❌ NPCAP_LIB_PATH environment variable is not set for Windows build. This is required to link Npcap libraries. Please set it in your workflow file.");
        }
    }

    // 元々の Tauri ビルド処理
    tauri_build::build();
}
