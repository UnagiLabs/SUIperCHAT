# SUIperCHAT Smart Contract (日本語)

SUIperCHAT Smart Contract は、SUIperCHAT サービスにおけるスーパーチャットの支払い処理と関連設定を管理する Sui Move スマートコントラクトです。

## 概要

このコントラクトは、視聴者から配信者へのスーパーチャット送金を仲介し、設定に基づいて手数料を徴収する機能を提供します。管理者は手数料の受取先や手数料率を変更できます。

## 主な機能

### 1. 初期設定 (`init` 関数)
- コントラクトのデプロイ時に実行され、以下の初期設定を行います。
  - **手数料設定オブジェクト (`PaymentConfig`) の作成**:
    - 手数料を受け取るアドレス（初期状態ではデプロイヤーのアドレス）
    - デフォルトの手数料率（初期値は5%）
  - **管理者権限オブジェクト (`AdminCap`) の作成**:
    - このオブジェクトを所有するアドレスが、コントラクト設定の変更権限を持ちます。デプロイ時にデプロイヤーへ送付されます。
- 設定が初期化されたことを示す `ConfigUpdated` イベントを発行します。

### 2. スーパーチャット送金処理 (`process_superchat_payment` 関数)
- 視聴者が指定した金額のコイン（例: SUI）と受取人（配信者）のアドレスを受け取ります。
- 以下の処理を実行します。
  1. 送金額が有効か（0より大きいか、支払いコイン残高内か）を検証します。
  2. 設定された手数料率に基づき手数料を計算します。
  3. 計算された手数料額を手数料受取先アドレスに送金します。
  4. 残りの金額（送金額 - 手数料額）を受取人（配信者）に送金します。
  5. 支払いに使用したコインの余りがあれば、送金者（視聴者）に返却します。
- 送金が成功すると、以下の情報を含む `SuperchatSent` イベントを発行します。
  - 送金者アドレス
  - 受取人アドレス
  - 送金総額
  - 手数料額
  - 受取人が実際に受け取る額
  - 使用された設定オブジェクトのID

### 3. 手数料受取先の変更 (`update_fee_recipient` 関数)
- `AdminCap` を所有する管理者のみが実行可能です。
- スーパーチャットの手数料を受け取るSUIアドレスを変更します。
- 変更が完了すると `ConfigUpdated` イベントを発行します。

### 4. デフォルト手数料率の変更 (`update_default_fee_percentage` 関数)
- `AdminCap` を所有する管理者のみが実行可能です。
- スーパーチャット送金時のデフォルト手数料率（0%～100%の範囲で指定）を変更します。
- 手数料率が範囲外の場合、エラーが発生します。
- 変更が完了すると `ConfigUpdated` イベントを発行します。

## イベント

このコントラクトは、特定の操作が成功した際に以下のイベントを発行します。

- **`ConfigUpdated`**:
  - `PaymentConfig` の初期化時
  - 手数料受取先アドレスの変更時
  - デフォルト手数料率の変更時
- **`SuperchatSent<T>`**:
  - `process_superchat_payment` 関数によるスーパーチャット送金成功時

## ファイル構成

- `sources/payment.move`: メインの支払いコントラクトが実装されています。
- `tests/payment_tests.move`: コントラクトのテストコードです。

---

# SUIperCHAT Smart Contract (English)

The SUIperCHAT Smart Contract is a Sui Move smart contract that manages Super Chat payment processing and related configurations for the SUIperCHAT service.

## Overview

This contract facilitates Super Chat payments from viewers to streamers and provides functionality to collect fees based on configured settings. Administrators can modify the fee recipient and fee percentage.

## Key Features

### 1. Initialization (`init` function)
- Executed once upon contract deployment, performing the following initial setup:
  - **Creation of Fee Configuration Object (`PaymentConfig`)**:
    - Address to receive fees (initially the deployer's address).
    - Default fee percentage (initial value is 5%).
  - **Creation of Admin Capability Object (`AdminCap`)**:
    - The address owning this object has the authority to change contract settings. It is sent to the deployer upon deployment.
- Emits a `ConfigUpdated` event to indicate that the configuration has been initialized.

### 2. Super Chat Payment Processing (`process_superchat_payment` function)
- Receives a coin (e.g., SUI) of a specified amount from a viewer and the recipient's (streamer's) address.
- Performs the following actions:
  1. Validates if the payment amount is valid (greater than 0 and within the payer's coin balance).
  2. Calculates the fee based on the configured fee percentage.
  3. Transfers the calculated fee amount to the fee recipient address.
  4. Transfers the remaining amount (payment amount - fee amount) to the recipient (streamer).
  5. Returns any remaining balance of the payment coin to the sender (viewer).
- Upon successful payment, emits a `SuperchatSent` event containing:
  - Sender's address
  - Recipient's address
  - Total payment amount
  - Fee amount
  - Amount actually received by the recipient
  - ID of the configuration object used

### 3. Update Fee Recipient (`update_fee_recipient` function)
- Can only be executed by an administrator who owns the `AdminCap`.
- Changes the SUI address that receives Super Chat fees.
- Emits a `ConfigUpdated` event upon successful update.

### 4. Update Default Fee Percentage (`update_default_fee_percentage` function)
- Can only be executed by an administrator who owns the `AdminCap`.
- Changes the default fee percentage (specified between 0% and 100%) for Super Chat payments.
- An error occurs if the fee percentage is outside the valid range.
- Emits a `ConfigUpdated` event upon successful update.

## Events

This contract emits the following events when specific operations are successful:

- **`ConfigUpdated`**:
  - Upon initialization of `PaymentConfig`.
  - When the fee recipient address is changed.
  - When the default fee percentage is changed.
- **`SuperchatSent<T>`**:
  - Upon successful Super Chat payment via the `process_superchat_payment` function.

## File Structure

- `sources/payment.move`: Contains the implementation of the main payment contract.
- `tests/payment_tests.move`: Contains test code for the contract.
