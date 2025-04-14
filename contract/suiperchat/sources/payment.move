/// スーパーチャットの送金処理を行うモジュール
///
/// このモジュールでは、スーパーチャット機能の送金処理とその手数料計算を行います。
/// AdminCapabilityを使用して管理者権限を制御し、送金成功時に `SuperchatSent` イベントを発行します。
module suiperchat::payment {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;

    /// 手数料率が無効な場合のエラー
    const EINVALID_FEE: u64 = 1;
    /// 送金額が無効な場合のエラー
    const EINVALID_AMOUNT: u64 = 2;
    /// 無効なAdminCapabilityのエラー
    const EINVALID_ADMIN_CAP: u64 = 4;

    /// 管理者権限を表すCapability
    /// 
    /// このオブジェクトを所有するアドレスが管理者として設定の変更などを行えます。
    public struct AdminCap has key, store {
        id: UID
    }

    /// コントラクトの設定情報を保持するシングルトンオブジェクト
    public struct PaymentConfig has key {
        id: UID,
        /// 手数料を受け取るアドレス
        fee_recipient: address,
        /// デフォルトの手数料率 (例: 5% -> 5)
        default_fee_percentage: u8,
        /// このコンフィグに対応するAdminCapのID
        admin_cap_id: object::ID
    }

    /// 設定が更新されたときに発行されるイベント
    public struct ConfigUpdated has copy, drop {
        /// 更新されたコンフィグのID
        config_id: object::ID,
        /// どのような更新が行われたか（手数料受取人または手数料率）
        update_type: vector<u8>,
        /// 更新を行った管理者のアドレス
        admin: address
    }

    /// スーパーチャットが送信されたときに発行されるイベント
    public struct SuperchatSent has copy, drop {
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
        config_id: object::ID
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
        let admin_cap_id = object::id(&admin_cap);
        let sender = tx_context::sender(ctx);

        // コントラクト設定を作成し、共有オブジェクトとして登録
        let config = PaymentConfig {
            id: object::new(ctx),
            fee_recipient: sender, // デプロイした人を初期受取人に
            default_fee_percentage: 5, // デフォルト手数料5%
            admin_cap_id
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
    /// # 引数
    /// * `config` - コントラクトの設定オブジェクト
    /// * `payment` - 支払いに使用するSUIコイン
    /// * `amount` - 送金する金額
    /// * `recipient` - 受取人のアドレス
    /// * `ctx` - トランザクションコンテキスト
    ///
    /// # イベント
    /// * `SuperchatSent` - 送金成功時に発行される
    ///
    /// # エラー
    /// * `EINVALID_AMOUNT` - 指定された送金額が0以下、または支払いコインの残高を超えている
    public entry fun process_superchat_payment(
        config: &PaymentConfig,
        payment: &mut Coin<SUI>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        // 基本的な検証
        assert!(amount > 0, EINVALID_AMOUNT);
        assert!(coin::value(payment) >= amount, EINVALID_AMOUNT);

        // 手数料計算
        let fee_percentage = config.default_fee_percentage;
        let mut total_payment = coin::split(payment, amount, ctx);
        
        // 手数料と受取人への送金額を計算
        let fee_amount = (amount * (fee_percentage as u64)) / 100;
        // 受取人への送金額を計算
        let recipient_amount = amount - fee_amount;

        // 手数料を受取人に送金
        if (fee_amount > 0) {
            let fee_coin = coin::split(&mut total_payment, fee_amount, ctx);
            transfer::public_transfer(fee_coin, config.fee_recipient);
        };

        // 残りを本来の受取人に送金
        transfer::public_transfer(total_payment, recipient);

        // スーパーチャット送信イベントを発行
        event::emit(SuperchatSent {
            sender: tx_context::sender(ctx),
            recipient, // 関数の引数 recipient をそのまま使用
            total_amount: amount, // 関数の引数 amount をそのまま使用
            fee_amount, // 計算済みの fee_amount
            recipient_amount, // 計算済みの recipient_amount
            config_id: object::id(config)
        });
    }

    /// 手数料受取先アドレスを変更する関数
    ///
    /// # 引数
    /// * `admin_cap` - 管理者権限を証明するCapability
    /// * `config` - コントラクトの設定オブジェクト
    /// * `new_recipient` - 新しい手数料受取先アドレス
    /// * `ctx` - トランザクションコンテキスト
    ///
    /// # エラー
    /// * `EINVALID_ADMIN_CAP` - 提供されたAdminCapが無効な場合
    public entry fun update_fee_recipient(
        admin_cap: &AdminCap,
        config: &mut PaymentConfig,
        new_recipient: address,
        ctx: &mut TxContext
    ) {
        // AdminCapが有効かどうかを検証
        assert_valid_admin(admin_cap, config);
        
        // 手数料受取先を更新
        config.fee_recipient = new_recipient;
        
        // 設定更新イベントを発行
        event::emit(ConfigUpdated {
            config_id: object::id(config),
            update_type: b"fee_recipient_updated",
            admin: tx_context::sender(ctx)
        });
    }

    /// デフォルト手数料率を変更する関数
    ///
    /// # 引数
    /// * `admin_cap` - 管理者権限を証明するCapability
    /// * `config` - コントラクトの設定オブジェクト
    /// * `new_fee_percentage` - 新しい手数料率(0-100)
    /// * `ctx` - トランザクションコンテキスト
    ///
    /// # エラー
    /// * `EINVALID_FEE` - 手数料率が0-100の範囲外の場合
    /// * `EINVALID_ADMIN_CAP` - 提供されたAdminCapが無効な場合
    public entry fun update_default_fee_percentage(
        admin_cap: &AdminCap,
        config: &mut PaymentConfig,
        new_fee_percentage: u8,
        ctx: &mut TxContext
    ) {
        // AdminCapが有効かどうかを検証
        assert_valid_admin(admin_cap, config);
        
        // 手数料率の検証
        assert!(new_fee_percentage <= 100, EINVALID_FEE);
        
        // 手数料率を更新
        config.default_fee_percentage = new_fee_percentage;
        
        // 設定更新イベントを発行
        event::emit(ConfigUpdated {
            config_id: object::id(config),
            update_type: b"fee_percentage_updated",
            admin: tx_context::sender(ctx)
        });
    }

    /// AdminCapabilityが有効かどうかを検証するヘルパー関数
    ///
    /// # 引数
    /// * `admin_cap` - 検証するAdminCapability
    /// * `config` - コントラクトの設定オブジェクト
    ///
    /// # エラー
    /// * `EINVALID_ADMIN_CAP` - 提供されたAdminCapが無効な場合
    fun assert_valid_admin(admin_cap: &AdminCap, config: &PaymentConfig) {
        assert!(object::id(admin_cap) == config.admin_cap_id, EINVALID_ADMIN_CAP);
    }
}