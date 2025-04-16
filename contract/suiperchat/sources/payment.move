/// スーパーチャットの送金処理を行うモジュール
///
/// このモジュールでは、スーパーチャット機能の送金処理とその手数料計算を行います。
/// AdminCapabilityを使用して管理者権限を制御し、送金成功時に `SuperchatSent` イベントを発行します。
module suiperchat::payment {
    use sui::coin::{Self, Coin};
    use sui::event;

    /// 手数料率が無効な場合のエラー
    const EINVALID_FEE: u64 = 1;
    /// 送金額が無効な場合のエラー
    const EINVALID_AMOUNT: u64 = 2;

    /// 管理者権限を表すCapability
    ///
    /// このオブジェクトを所有するアドレスが管理者として設定の変更などを行えます。
    /// init関数で1つだけ生成され、デプロイヤーに送信されます。
    public struct AdminCap has key, store {
        id: UID
    }

    /// コントラクトの設定情報を保持するシングルトンオブジェクト
    public struct PaymentConfig has key {
        id: UID,
        /// 手数料を受け取るアドレス
        fee_recipient: address,
        /// デフォルトの手数料率 (例: 5% -> 5)
        default_fee_percentage: u8
    }

    /// 設定が更新されたときに発行されるイベント
    public struct ConfigUpdated has copy, drop {
        /// 更新されたコンフィグのID
        config_id: ID,
        /// どのような更新が行われたか（手数料受取人または手数料率）
        update_type: vector<u8>,
        /// 更新を行った管理者のアドレス
        admin: address
    }

    /// スーパーチャットが送信されたときに発行されるイベント
    public struct SuperchatSent<phantom T> has copy, drop {
        /// 送金者のアドレス
        sender: address,
        /// 受取人のアドレス
        recipient: address,
        /// 送金された総額
        total_amount: u64,
        /// 計算された手数料額
        fee_amount: u64,
        /// 受取人が実際に受け取る額
        recipient_amount: u64,
        /// 使用されたコンフィグのID
        config_id: ID
    }

    /// モジュールの初期化関数
    ///
    /// コントラクト設定オブジェクトとAdminCapabilityを作成します。
    /// AdminCapabilityはデプロイヤーに送信されます。
    fun init(ctx: &mut TxContext) {
        // 管理者権限のCapabilityを作成
        let admin_cap = AdminCap {
            id: object::new(ctx)
        };
        let sender = tx_context::sender(ctx);

        // コントラクト設定を作成し、共有オブジェクトとして登録
        let config = PaymentConfig {
            id: object::new(ctx),
            fee_recipient: sender, // デプロイした人を初期受取人に
            default_fee_percentage: 5 // デフォルト手数料5%
        };

        // 設定更新イベントを発行
        let config_id = object::id(&config);
        event::emit(ConfigUpdated {
            config_id,
            update_type: b"initialized",
            admin: sender
        });

        // 管理者権限のCapabilityを発行者に送る
        transfer::transfer(admin_cap, sender);

        // 設定オブジェクトを共有する
        transfer::share_object(config);
    }

    /// スーパーチャットの送金処理を行い、成功時に `SuperchatSent` イベントを発行する関数
    ///
    /// # 型パラメータ
    /// * `T` - 支払いに使用するコインの型（例：SUI, USDC など）
    ///
    /// # 引数
    /// * `config` - コントラクトの設定オブジェクト
    /// * `payment` - 支払いに使用するコイン
    /// * `amount` - 送金する金額
    /// * `recipient` - 受取人のアドレス
    /// * `ctx` - トランザクションコンテキスト
    ///
    /// # イベント
    /// * `SuperchatSent` - 送金成功時に発行される
    ///
    /// # エラー
    /// * `EINVALID_AMOUNT` - 指定された送金額が0以下、または支払いコインの残高を超えている
    public entry fun process_superchat_payment<T>(
        config: &PaymentConfig,
        mut payment: Coin<T>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        // 基本的な検証
        assert!(amount > 0, EINVALID_AMOUNT);
        assert!(coin::value(&payment) >= amount, EINVALID_AMOUNT);

        // 送信者のアドレスを取得
        let sender = tx_context::sender(ctx);

        // 手数料計算
        let fee_percentage = config.default_fee_percentage;

        // 送金用のコインを分割
        let mut superchat_coin = coin::split(&mut payment, amount, ctx);

        // 手数料と受取人への送金額を計算
        let fee_amount = (amount * (fee_percentage as u64)) / 100;
        let recipient_amount = amount - fee_amount;

        // 手数料を分割して送金
        if (fee_amount > 0) {
            let fee_coin = coin::split(&mut superchat_coin, fee_amount, ctx);
            transfer::public_transfer(fee_coin, config.fee_recipient);
        };

        // 残りを受取人に送金
        transfer::public_transfer(superchat_coin, recipient);

        // 余りを送信者に返却
        transfer::public_transfer(payment, sender);

        // スーパーチャット送信イベントを発行
        event::emit(SuperchatSent<T> {
            sender,
            recipient,
            total_amount: amount,
            fee_amount,
            recipient_amount,
            config_id: object::id(config)
        });
    }

    /// 手数料受取先アドレスを変更する関数
    ///
    /// # 引数
    /// * `admin_cap` - 管理者権限を証明するCapability (型チェックのみで権限を検証)
    /// * `config` - コントラクトの設定オブジェクト
    /// * `new_recipient` - 新しい手数料受取先アドレス
    /// * `ctx` - トランザクションコンテキスト
    public entry fun update_fee_recipient(
        _: &AdminCap, // 引数の型で権限を暗黙的に検証
        config: &mut PaymentConfig,
        new_recipient: address,
        ctx: &mut TxContext
    ) {
        // AdminCapの有効性チェック (assert_valid_admin) を削除
        // admin_cap引数が存在すること自体が権限の証明となる

        // 手数料受取先を更新
        config.fee_recipient = new_recipient;

        // 設定更新イベントを発行
        event::emit(ConfigUpdated {
            config_id: object::id(config),
            update_type: b"fee_recipient_updated",
            admin: tx_context::sender(ctx) // イベント発行者はトランザクションの送信者
        });
    }

    /// デフォルト手数料率を変更する関数
    ///
    /// # 引数
    /// * `admin_cap` - 管理者権限を証明するCapability (型チェックのみで権限を検証)
    /// * `config` - コントラクトの設定オブジェクト
    /// * `new_fee_percentage` - 新しい手数料率(0-100)
    /// * `ctx` - トランザクションコンテキスト
    ///
    /// # エラー
    /// * `EINVALID_FEE` - 手数料率が0-100の範囲外の場合
    public entry fun update_default_fee_percentage(
        _: &AdminCap, // 引数の型で権限を暗黙的に検証
        config: &mut PaymentConfig,
        new_fee_percentage: u8,
        ctx: &mut TxContext
    ) {
        // AdminCapの有効性チェック (assert_valid_admin) を削除
        // admin_cap引数が存在すること自体が権限の証明となる

        // 手数料率の検証
        assert!(new_fee_percentage <= 100, EINVALID_FEE);

        // 手数料率を更新
        config.default_fee_percentage = new_fee_percentage;

        // 設定更新イベントを発行
        event::emit(ConfigUpdated {
            config_id: object::id(config),
            update_type: b"fee_percentage_updated",
            admin: tx_context::sender(ctx) // イベント発行者はトランザクションの送信者
        });
    }

    // ======== テスト用関数 ========
    #[test_only]
    /// テスト用の初期化関数
    public fun test_init(ctx: &mut TxContext) {
        init(ctx)
    }

    #[test_only]
    /// テスト用の手数料受取人取得関数
    public fun test_get_fee_recipient(config: &PaymentConfig): address {
        config.fee_recipient
    }

    #[test_only]
    /// テスト用の手数料率取得関数
    public fun test_get_fee_percentage(config: &PaymentConfig): u8 {
        config.default_fee_percentage
    }
}