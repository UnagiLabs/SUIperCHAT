/// スーパーチャットの送金処理モジュールのテスト
///
/// このファイルでは、payment.moveの各機能に対するユニットテストを提供します。
/// 主に、初期化、スーパーチャット送金、設定更新機能のテストケースが含まれています。
#[test_only]
module suiperchat::payment_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_utils::assert_eq;

    use suiperchat::payment::{Self, AdminCap, PaymentConfig};

    /// テスト用アカウントアドレス
    const ADMIN: address = @0xA;
    const USER: address = @0xB;
    const RECIPIENT: address = @0xC;

    /// テスト用定数
    const INITIAL_BALANCE: u64 = 10000;
    const SUPERCHAT_AMOUNT: u64 = 1000;
    const DEFAULT_FEE_PERCENTAGE: u8 = 5;
    const NEW_FEE_PERCENTAGE: u8 = 10;

    /// 基本テストシナリオをセットアップして返す関数
    ///
    /// # 戻り値
    /// * `Scenario` - セットアップ済みのテストシナリオ
    fun setup_test(): Scenario {
        let mut scenario_val = ts::begin(ADMIN);
        {
            // モジュールの初期化を実行（初期化は内部関数なので直接呼べない）
            // テスト用に公開されたメソッドを呼び出す
            ts::next_tx(&mut scenario_val, ADMIN);
            payment::test_init(ts::ctx(&mut scenario_val));
        };
        scenario_val
    }

    /// スーパーチャット送金のテスト用にコインを準備する関数
    ///
    /// # 引数
    /// * `amount` - 作成するコインの金額
    /// * `ctx` - トランザクションコンテキスト
    ///
    /// # 戻り値
    /// * `Coin<SUI>` - 作成されたSUIコイン
    fun create_test_coin(amount: u64, ctx: &mut TxContext): Coin<SUI> {
        coin::mint_for_testing<SUI>(amount, ctx)
    }

    /// モジュール初期化のテスト
    ///
    /// 初期化後にPaymentConfigとAdminCapが正しく作成されることを検証します。
    #[test]
    fun test_init() {
        let mut scenario_val = setup_test();

        // AdminがAdminCapを受け取っていることを確認
        ts::next_tx(&mut scenario_val, ADMIN);
        {
            assert!(ts::has_most_recent_for_address<AdminCap>(ADMIN), 0);
        };

        // PaymentConfigが作成され共有されていることを確認
        ts::next_tx(&mut scenario_val, ADMIN);
        {
            assert!(ts::has_most_recent_shared<PaymentConfig>(), 0);

            let config = ts::take_shared<PaymentConfig>(&scenario_val);
            // フィールドに直接アクセスできないため、テスト用のgetterメソッドを使用
            assert_eq(payment::test_get_fee_recipient(&config), ADMIN);
            assert_eq(payment::test_get_fee_percentage(&config), DEFAULT_FEE_PERCENTAGE);

            let admin_cap = ts::take_from_address<AdminCap>(&scenario_val, ADMIN);
            assert_eq(payment::test_get_admin_cap_id(&config), object::id(&admin_cap));

            ts::return_shared(config);
            ts::return_to_address(ADMIN, admin_cap);
        };

        ts::end(scenario_val);
    }

    /// スーパーチャット送金処理のテスト
    ///
    /// 正しい金額が送金され、手数料が計算されることを検証します。
    #[test]
    fun test_process_superchat_payment() {
        let mut scenario_val = setup_test();

        // ユーザーとしてスーパーチャットを送信
        ts::next_tx(&mut scenario_val, USER);
        {
            let config = ts::take_shared<PaymentConfig>(&scenario_val);
            let ctx = ts::ctx(&mut scenario_val);

            // テスト用コインを作成
            let mut payment = create_test_coin(INITIAL_BALANCE, ctx);

            // スーパーチャット送金を実行
            payment::process_superchat_payment(
                &config,
                &mut payment,
                SUPERCHAT_AMOUNT,
                RECIPIENT,
                ctx
            );

            // 計算された手数料
            let fee_amount = (SUPERCHAT_AMOUNT * (DEFAULT_FEE_PERCENTAGE as u64)) / 100;
            let _recipient_amount = SUPERCHAT_AMOUNT - fee_amount;

            // 残高を確認
            assert_eq(coin::value(&payment), INITIAL_BALANCE - SUPERCHAT_AMOUNT);

            // 残りのコインをユーザーに返却
            transfer::public_transfer(payment, USER);

            ts::return_shared(config);
        };

        // 受取人が正しい金額を受け取ったことを確認
        ts::next_tx(&mut scenario_val, RECIPIENT);
        {
            let fee_amount = (SUPERCHAT_AMOUNT * (DEFAULT_FEE_PERCENTAGE as u64)) / 100;
            let recipient_amount = SUPERCHAT_AMOUNT - fee_amount;

            let recipient_coin = ts::take_from_address<Coin<SUI>>(&scenario_val, RECIPIENT);
            assert_eq(coin::value(&recipient_coin), recipient_amount);

            ts::return_to_address(RECIPIENT, recipient_coin);
        };

        // 手数料が正しく送金されたことを確認
        ts::next_tx(&mut scenario_val, ADMIN);
        {
            let fee_amount = (SUPERCHAT_AMOUNT * (DEFAULT_FEE_PERCENTAGE as u64)) / 100;

            let admin_coin = ts::take_from_address<Coin<SUI>>(&scenario_val, ADMIN);
            assert_eq(coin::value(&admin_coin), fee_amount);

            ts::return_to_address(ADMIN, admin_coin);
        };

        ts::end(scenario_val);
    }

    /// 手数料受取先アドレス更新のテスト
    ///
    /// 管理者が正しく手数料受取先を変更できることを検証します。
    #[test]
    fun test_update_fee_recipient() {
        let mut scenario_val = setup_test();

        // 管理者として手数料受取先を更新
        ts::next_tx(&mut scenario_val, ADMIN);
        {
            let mut config = ts::take_shared<PaymentConfig>(&scenario_val);
            let admin_cap = ts::take_from_address<AdminCap>(&scenario_val, ADMIN);
            let ctx = ts::ctx(&mut scenario_val);

            // 受取先をRECIPIENTに変更
            payment::update_fee_recipient(
                &admin_cap,
                &mut config,
                RECIPIENT,
                ctx
            );

            // 更新を確認
            assert_eq(payment::test_get_fee_recipient(&config), RECIPIENT);

            ts::return_shared(config);
            ts::return_to_address(ADMIN, admin_cap);
        };

        ts::end(scenario_val);
    }

    /// 手数料率更新のテスト
    ///
    /// 管理者が正しく手数料率を変更できることを検証します。
    #[test]
    fun test_update_default_fee_percentage() {
        let mut scenario_val = setup_test();

        // 管理者として手数料率を更新
        ts::next_tx(&mut scenario_val, ADMIN);
        {
            let mut config = ts::take_shared<PaymentConfig>(&scenario_val);
            let admin_cap = ts::take_from_address<AdminCap>(&scenario_val, ADMIN);
            let ctx = ts::ctx(&mut scenario_val);

            // 手数料率を10%に変更
            payment::update_default_fee_percentage(
                &admin_cap,
                &mut config,
                NEW_FEE_PERCENTAGE,
                ctx
            );

            // 更新を確認
            assert_eq(payment::test_get_fee_percentage(&config), NEW_FEE_PERCENTAGE);

            ts::return_shared(config);
            ts::return_to_address(ADMIN, admin_cap);
        };

        ts::end(scenario_val);
    }

    /// 不正な手数料率でのエラーテスト
    ///
    /// 100%を超える手数料率を設定しようとするとエラーになることを検証します。
    #[test]
    #[expected_failure(abort_code = payment::EINVALID_FEE)]
    fun test_invalid_fee_percentage() {
        let mut scenario_val = setup_test();

        // 管理者として無効な手数料率を設定しようとする
        ts::next_tx(&mut scenario_val, ADMIN);
        {
            let mut config = ts::take_shared<PaymentConfig>(&scenario_val);
            let admin_cap = ts::take_from_address<AdminCap>(&scenario_val, ADMIN);
            let ctx = ts::ctx(&mut scenario_val);

            // 101%の手数料率を設定しようとする（エラーになるはず）
            payment::update_default_fee_percentage(
                &admin_cap,
                &mut config,
                101, // 101%は無効
                ctx
            );

            ts::return_shared(config);
            ts::return_to_address(ADMIN, admin_cap);
        };

        ts::end(scenario_val);
    }

    /// 無効なAdminCapabilityでのエラーテスト
    ///
    /// 別のユーザーがAdminCapを持っていない場合にエラーになることを検証します。
    #[test]
    #[expected_failure(abort_code = payment::EINVALID_ADMIN_CAP)]
    fun test_invalid_admin_cap() {
        let mut scenario_val = setup_test();

        // テスト用の不正なAdminCapをテストモジュールから取得
        ts::next_tx(&mut scenario_val, USER);
        {
            let ctx = ts::ctx(&mut scenario_val);
            // 構造体を直接インスタンス化する代わりにテスト用のヘルパー関数を使用
            payment::test_create_fake_admin_cap(USER, ctx);
        };

        // 不正なAdminCapを使って設定を変更しようとする
        ts::next_tx(&mut scenario_val, USER);
        {
            let mut config = ts::take_shared<PaymentConfig>(&scenario_val);
            let fake_admin_cap = ts::take_from_address<AdminCap>(&scenario_val, USER);
            let ctx = ts::ctx(&mut scenario_val);

            // エラーになるはず
            payment::update_fee_recipient(
                &fake_admin_cap,
                &mut config,
                USER,
                ctx
            );

            ts::return_shared(config);
            ts::return_to_address(USER, fake_admin_cap);
        };

        ts::end(scenario_val);
    }

    /// 無効な送金額でのエラーテスト
    ///
    /// 残高を超える金額を送金しようとするとエラーになることを検証します。
    #[test]
    #[expected_failure(abort_code = payment::EINVALID_AMOUNT)]
    fun test_insufficient_balance() {
        let mut scenario_val = setup_test();

        // ユーザーとして残高を超える金額を送金しようとする
        ts::next_tx(&mut scenario_val, USER);
        {
            let config = ts::take_shared<PaymentConfig>(&scenario_val);
            let ctx = ts::ctx(&mut scenario_val);

            // 残高より少ないコインを作成
            let mut payment = create_test_coin(SUPERCHAT_AMOUNT - 1, ctx);

            // 残高を超える金額を送金しようとする（エラーになるはず）
            payment::process_superchat_payment(
                &config,
                &mut payment,
                SUPERCHAT_AMOUNT,
                RECIPIENT,
                ctx
            );

            transfer::public_transfer(payment, USER);
            ts::return_shared(config);
        };

        ts::end(scenario_val);
    }

    /// ゼロ金額送金のエラーテスト
    ///
    /// 0金額での送金がエラーになることを検証します。
    #[test]
    #[expected_failure(abort_code = payment::EINVALID_AMOUNT)]
    fun test_zero_amount() {
        let mut scenario_val = setup_test();

        // ユーザーとして0金額を送金しようとする
        ts::next_tx(&mut scenario_val, USER);
        {
            let config = ts::take_shared<PaymentConfig>(&scenario_val);
            let ctx = ts::ctx(&mut scenario_val);

            let mut payment = create_test_coin(INITIAL_BALANCE, ctx);

            // 0金額を送金しようとする（エラーになるはず）
            payment::process_superchat_payment(
                &config,
                &mut payment,
                0, // ゼロ金額
                RECIPIENT,
                ctx
            );

            transfer::public_transfer(payment, USER);
            ts::return_shared(config);
        };

        ts::end(scenario_val);
    }
}
