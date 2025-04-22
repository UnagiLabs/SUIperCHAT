# SUI SDK統合 計画書 (v1.7)

## 1. 目標

`viewer` アプリケーションのフロントエンドから、`contract/suiperchat` の `payment::process_superchat_payment` スマートコントラクト関数を呼び出し、ユーザーが指定したSUIを指定した配信者アドレスに送金する機能を実装する。

## 2. 背景

現在、`viewer/src/components/superchat/superchat-form.tsx` のフォーム送信処理では、ダミーデータを用いてWebSocketメッセージを送信している。この部分を実際のSuiブロックチェーンへのトランザクション発行処理に置き換える必要がある。

## 3. 実装方針

*   `@mysten/dapp-kit` が提供する `useSuiClient` でSuiクライアントを取得し、`suiClient.getCoins` で支払い元の `Coin<SUI>` オブジェクトを取得する。
*   取得したCoinオブジェクトと `@mysten/dapp-kit` の `useSignAndExecuteTransaction` フックを利用して、Suiトランザクションの構築、署名、実行を行う。

## 4. 実装ステップ（段階的コミット案）

### ステップ 1: 設定と定数の準備

*   **内容**:
    *   `viewer/src/lib/constants.ts` を作成し、以下の定数を定義する。
        *   `PACKAGE_ID = "0x35e27980d6195441e4b9ae3750debff967462d3d2bff36c052b41b4cf4292258"`
        *   `PAYMENT_CONFIG_ID = "0x0ab53f74c6f40a6fe790689475c2546e549ffdcb7af77068ada4e459a1518599"`
        *   `SUI_TYPE_ARG = "0x2::sui::SUI"`
        *   `SUI_TO_MIST = 1_000_000_000n`
        *   `DEFAULT_GAS_BUDGET = 20_000_000n` // 例: 0.02 SUI (MIST単位) - 適切な値に調整
    *   MISTとSUIの変換ユーティリティ関数 (`suiToMist`, `mistToSui`) を `viewer/src/lib/utils.ts` に追加する。
*   **確認方法**:
    *   ファイルが正しく作成され、定数が定義されていること。
    *   型エラーやlintエラーがないこと。
    *   ユーティリティ関数が期待通りに動作するか簡単なテストを行う。
*   **コミットタイトル案**: `[feat]: Suiコントラクト定数とMIST変換ユーティリティを追加`

### ステップ 2: フォームコンポーネントへのフック導入と状態管理

*   **内容**:
    *   `viewer/src/components/superchat/superchat-form.tsx` を編集。
    *   `@mysten/dapp-kit` から `useSuiClient`, `useSignAndExecuteTransaction`, `useCurrentAccount` をインポート。
    *   コンポーネント内でこれらのフックを呼び出す。
    *   `isPending` を取得。
    *   `onSubmit` を `async` に変更。
    *   `onSubmit` の最初に `currentAccount` の存在チェックを追加。
*   **確認方法**:
    *   コンポーネントレンダリング確認。
    *   ウォレット未接続時のエラーToast確認。
    *   `isPending` が `false` であること。
*   **コミットタイトル案**: `[feat]: SuperchatフォームにSuiクライアントとトランザクションフックを導入`

### ステップ 3: 支払いコインの取得とPTB構築

*   **内容**:
    *   `superchat-form.tsx` の `async onSubmit` 関数内を編集。
    *   `suiClient.getCoins` を使用して `Coin<SUI>` リストを取得。
        *   **注意**: `getCoins` はページングされるため、多数のCoinオブジェクトを持つユーザーの場合、全量を取得するには複数回のリクエストが必要になる可能性がある。**今回は最初のページ（最大50件）のみを取得し、その中から十分な残高を持つコインを探す**方針とする。より完全な対応（`hasNextPage` を使ったループ処理や`mergeCoins`）は将来の改善タスクとする (#Issue番号)。
    *   取得したコインリストから、支払い額 (`sui_amount_mist`) 以上の残高を持つ**単一の**コインオブジェクトを検索・選択する。
        *   見つからない場合はエラーToastを表示し処理中断。
    *   `Transaction` インスタンスを作成。
    *   選択したコインオブジェクトIDを使って `tx.splitCoins(tx.object(coinObjectId), [tx.pure.u64(sui_amount_mist)])` で支払い用Coinを準備 (**金額引数を `tx.pure.u64` でラップ**)。
    *   `tx.moveCall` で `process_superchat_payment` 関数呼び出しPTBを構築。
        *   **金額引数も `tx.pure.u64(sui_amount_mist)` でラップするよう修正**。
    *   `tx.setGasBudget(DEFAULT_GAS_BUDGET)` でガス予算を設定。
*   **確認方法**:
    *   コードが正しく記述され、型エラーやlintエラーがないこと。
    *   ウォレット接続状態でConfirmボタンをクリックした際に、
        *   SUI残高が十分にある場合: PTB構築部分でエラーが発生しないこと。
        *   SUI残高が不足している場合（最初の50件のコインで足りない場合含む）: エラーToastが表示され、処理中断すること。
        *   SUIコインが全くない場合: エラーToastが表示され、処理中断すること。
    *   コンソールログ等で構築された `tx` オブジェクト、選択された支払い元コインID、設定されたガス予算を確認（任意）。
*   **コミットタイトル案**: `[feat]: suiClient.getCoinsで支払い元SUIを取得しPTBを構築 (ページング考慮追加)`

### ステップ 4: トランザクションの実行とコールバック処理

*   **内容**:
    *   `superchat-form.tsx` の `onSubmit` 関数内を編集。
    *   構築した `tx` を使って `signAndExecuteTransaction` を呼び出す。
    *   `onSuccess` コールバックを実装 (変更なし)。
    *   `onError` コールバックを実装:
        *   コンソールログでエラーを確認。
        *   `error` オブジェクトの **`code` プロパティ** や `instanceof` を使用してエラー種別を判別する（例: `error.code === 'USER_REJECTED'` や `error instanceof WalletNotConnectedError` など、dApp Kitが提供するエラー型を確認）。
        *   判別結果に基づき、対応するエラーToastを表示。
        *   確認モードを解除。
*   **確認方法**:
    *   **テストネット** または **Devnet** 環境でテスト。
    *   **成功時**: 以前と同様（Toast表示、WS送信、フォームリセット）。
    *   **失敗時 (ユーザー拒否)**: エラーコードに基づいたToast表示確認。
    *   **失敗時 (残高不足)**: (ステップ3でハンドリングされるはずだが) エラー発生時のToast表示確認。
    *   **失敗時 (ガス不足)**: ガス予算不足時のエラーToast表示確認。
    *   **失敗時 (バリデータエラー等)**: エラーコードに基づいたToast表示確認。
    *   Sui Explorerでトランザクション結果確認。
*   **コミットタイトル案**: `[feat]: Superchatフォームにトランザクション実行とエラーコードベースのコールバック処理を実装`

### ステップ 5: UI調整とローディング表示

*   **内容**:
    *   `superchat-form.tsx` を編集。
    *   `isPending` 状態を利用して送信ボタンのローディング表示。
    *   Toastメッセージのデザインや文言調整。
    *   エラーメッセージ詳細表示（任意）。
*   **確認方法**: (変更なし)
    *   送信ボタンのローディング表示と状態復帰確認。
    *   各種Toastメッセージ表示確認。
*   **コミットタイトル案**: `[refactor]: Superchatフォームのトランザクション実行中のUIフィードバックを改善`

---

## 5. SUI SDK/dApp Kit に関する確認済み事項

*   **`tx.pure.u64()` と `BigInt`**: Move Callの `u64` 型引数には **`tx.pure.u64()`** でラップして渡すのが推奨。
*   **支払い用 Coin の取得**: `suiClient.getCoins` で取得し、**十分な残高を持つ単一のCoinオブジェクトID** を `tx.splitCoins` に渡す。ページング考慮が必要な場合がある。
*   **送信者アドレスの取得**: `useCurrentAccount()` フックで取得。
*   **エラーハンドリング**: `getCoins`段階での残高不足チェックを追加。`onError` では **`error.code` やエラー型** で判定する。
*   **MIST単位の取り扱い**: 計算は `BigInt`、表示は `Number` で変換。
*   **ガス予算**: `tx.setGasBudget()` で明示的に設定することが推奨される。

## 6. 依存関係

*   `@mysten/dapp-kit`, `@mysten/sui` ライブラリ。
*   `suiperchat::payment` コントラクト情報 (上記4.1で定義した定数)。

## 7. テスト

*   支払いコイン取得ロジックのテスト:
    *   残高十分/不足/ゼロの場合の動作確認。
    *   多数のUTXOを持つアカウントでの動作確認（可能な範囲で）。
*   ガス予算不足時のエラーハンドリングテスト。