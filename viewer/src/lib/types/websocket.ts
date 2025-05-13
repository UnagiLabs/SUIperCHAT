/**
 * WebSocket通信で使用する型定義
 * WebSocketクライアントとサーバー間で交換するメッセージの型と構造を定義
 */

/**
 * メッセージタイプの列挙型
 * WebSocketを通じて送受信するメッセージの種類を定義
 */
export enum MessageType {
	/** 通常のチャットメッセージ (スパチャなし) */
	CHAT = "chat",
	/** スーパーチャットメッセージ (SUI送金あり) */
	SUPERCHAT = "superchat",
	/** 接続確認用のPINGメッセージ */
	PING = "ping",
	/** サーバーからのPONGレスポンス */
	PONG = "pong",
	/** エラーメッセージ */
	ERROR = "error",
	/** 接続状態の更新 */
	CONNECTION_STATUS = "connection_status",
	DISCONNECTED = "DISCONNECTED",
}

/**
 * スーパーチャットのデータ構造
 * スパチャメッセージに関連する情報を定義
 */
export interface SuperchatData {
	/** 送金額 (SUI単位) */
	amount: number;
	/** 使用されたコインの通貨シンボル (例: "SUI", "USDC") */
	coin: string;
	/** トランザクションハッシュ */
	tx_hash: string;
	/** 送金者のウォレットアドレス */
	wallet_address: string;
}

/**
 * 基本メッセージインターフェース
 * すべてのメッセージタイプの基本構造
 */
export interface BaseMessage {
	/** メッセージの種類 */
	type: MessageType;
	/** メッセージを識別するためのID */
	id: string;
	/** メッセージのタイムスタンプ */
	timestamp: number;
}

/**
 * チャットメッセージインターフェース
 * 通常のチャットメッセージの構造
 */
export interface ChatMessage extends BaseMessage {
	/** メッセージの種類（チャット） */
	type: MessageType.CHAT;
	/** 表示名 */
	display_name: string;
	/** メッセージ内容 */
	message: string;
}

/**
 * スーパーチャットメッセージインターフェース
 * スパチャを含むメッセージの構造
 */
export interface SuperchatMessage extends BaseMessage {
	/** メッセージの種類（スーパーチャット） */
	type: MessageType.SUPERCHAT;
	/** 表示名 */
	display_name: string;
	/** メッセージ内容 */
	message: string;
	/** スーパーチャットデータ */
	superchat: SuperchatData;
}

/**
 * エラーメッセージインターフェース
 * エラーに関する情報を含むメッセージの構造
 */
export interface ErrorMessage extends BaseMessage {
	/** メッセージの種類（エラー） */
	type: MessageType.ERROR;
	/** エラーコード */
	code: string;
	/** エラーメッセージ */
	message: string;
}

/**
 * 接続状態メッセージインターフェース
 * WebSocketの接続状態に関する情報を含むメッセージの構造
 */
export interface ConnectionStatusMessage extends BaseMessage {
	/** メッセージの種類（接続状態） */
	type: MessageType.CONNECTION_STATUS;
	/** 接続状態 */
	status: ConnectionStatus;
	/** 接続に関する追加情報（オプション） */
	info?: string;
}

/**
 * WebSocketの接続状態を表す列挙型
 */
export enum ConnectionStatus {
	/** 接続中 */
	CONNECTING = "connecting",
	/** 接続済み */
	CONNECTED = "connected",
	/** 切断中 */
	DISCONNECTING = "disconnecting",
	/** 切断済み */
	DISCONNECTED = "disconnected",
	/** 再接続中 */
	RECONNECTING = "reconnecting",
	/** エラー発生 */
	ERROR = "error",
}

/**
 * WebSocketコンテキストの状態インターフェース
 * WebSocketの状態管理に使用する型
 */
export interface WebSocketState {
	/** 接続状態 */
	status: ConnectionStatus;
	/** 接続URL */
	url: string | null;
	/** エラーメッセージ（エラー発生時） */
	error: string | null;
	/** 接続試行回数 */
	retryCount: number;
	/** メッセージ履歴 */
	messages: (ChatMessage | SuperchatMessage)[];
}

/**
 * WebSocketコンテキストで提供される関数インターフェース
 * WebSocketの操作に使用する関数群
 */
export interface WebSocketContextActions {
	/** WebSocket接続を開始する関数 */
	connect: (url: string) => void;
	/** WebSocket接続を切断する関数 */
	disconnect: () => void;
	/** チャットメッセージを送信する関数 */
	sendChatMessage: (displayName: string, message: string) => void;
	/** スーパーチャットメッセージを送信する関数 */
	sendSuperchatMessage: (
		displayName: string,
		message: string,
		superchatData: SuperchatData,
	) => void;
}

/**
 * WebSocketコンテキストの型定義
 * WebSocketの状態と操作関数を含むコンテキスト
 */
export interface WebSocketContextType {
	/** WebSocketの状態 */
	state: WebSocketState;
	/** WebSocketの操作関数 */
	actions: WebSocketContextActions;
}
