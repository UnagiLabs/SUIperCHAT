use std::env;
use std::path::{Path, PathBuf};

fn main() {
    // Windows ターゲットでのみ実行する (他のOSでは不要なため)
    if cfg!(target_os = "windows") {
        let npcap_path = if let Ok(npcap_path_str) = env::var("NPCAP_LIB_PATH") {
            // 環境変数が設定されている場合はその値を使用
            PathBuf::from(npcap_path_str)
        } else {
            // 環境変数が設定されていない場合はリポジトリ内のデフォルトパスを使用
            let cargo_manifest_dir =
                env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
            let default_path = Path::new(&cargo_manifest_dir).join("npcap_sdk");
            eprintln!(
                "⚠️ NPCAP_LIB_PATH環境変数が設定されていないため、デフォルトパス: {} を使用します",
                default_path.display()
            );
            default_path
        };

        // パスが存在するか確認
        if npcap_path.exists() && npcap_path.is_dir() {
            // リンカーにライブラリ検索パスを指示
            println!("cargo:rustc-link-search=native={}", npcap_path.display());
            println!("cargo:rerun-if-env-changed=NPCAP_LIB_PATH"); // 環境変数が変わったら再実行
            println!("cargo:rerun-if-changed=build.rs"); // このファイルが変わったら再実行

            // デバッグメッセージ
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
            panic!("❌ Npcap SDKパスが見つかりませんでした: {}。パスが正しいか確認してください。\nリポジトリに含まれるNpcap SDKを使用するか、NPCAP_LIB_PATH環境変数を適切に設定してください。", npcap_path.display());
        }
    }

    // 元々の Tauri ビルド処理
    tauri_build::build();
}
