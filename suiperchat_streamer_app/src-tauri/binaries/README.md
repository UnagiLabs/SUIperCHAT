# Loophole CLI バイナリ配置ディレクトリ

## 概要
このディレクトリには、アプリケーションに同梱するLoophole CLIバイナリを配置します。WebSocketサーバーのトンネリング機能を提供します。

## ディレクトリ構造
```
binaries/
├── LICENSE               # Loopholeのライセンスファイル
├── macos-aarch64/       # Apple Silicon Mac用
│   └── loophole         # 実行可能バイナリ
├── macos-x86_64/        # Intel Mac用
│   └── loophole         # 実行可能バイナリ
└── windows-x86_64/      # Windows用
    └── loophole.exe     # 実行可能バイナリ
```

## バイナリ配置手順
1. Loophole CLIの公式サイト（https://loophole.cloud/）からバイナリをダウンロードする
2. 各プラットフォーム用のバイナリを対応するディレクトリに配置する
3. macOS用バイナリには実行権限を付与する
   ```
   chmod +x macos-aarch64/loophole
   chmod +x macos-x86_64/loophole
   ```
4. Loopholeのライセンスファイルを配置する

## 注意事項
- バイナリは`.gitignore`に追加されており、リポジトリには含まれていません
- ビルド前に必ずバイナリを配置してください
- バイナリとライセンスファイルについては、Loopholeの利用規約に従ってください 