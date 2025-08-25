/**
 * 音声ユーティリティ
 * 
 * SUIperCHAT送信時の効果音を生成・再生するためのユーティリティ関数
 */

/**
 * Web Audio APIを使用してチャリン音を生成・再生する
 * 
 * @param amount - 送金額（音の高さと長さに影響）
 */
export function playSuperchatSound(amount: number): void {
	try {
		// Web Audio APIのサポートチェック
		if (!window.AudioContext && !(window as any).webkitAudioContext) {
			console.warn('Web Audio API is not supported in this browser');
			return;
		}

		const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
		const audioContext = new AudioContext();

		// 金額に応じた音の特性を計算
		const baseFrequency = 800; // 基本周波数
		const frequencyMultiplier = Math.min(amount / 10, 3); // 最大3倍まで
		const frequency = baseFrequency + (frequencyMultiplier * 200);
		
		const baseDuration = 0.3; // 基本音の長さ（秒）
		const duration = Math.min(baseDuration + (amount / 50), 1.0); // 最大1秒

		// チャリン音の回数（金額が高いほど多くなる）
		const coinCount = Math.min(Math.floor(amount / 5) + 1, 5);

		// 複数のチャリン音を順次再生
		for (let i = 0; i < coinCount; i++) {
			setTimeout(() => {
				createCoinSound(audioContext, frequency + (i * 100), duration * 0.8);
			}, i * 100);
		}

	} catch (error) {
		console.error('Failed to play superchat sound:', error);
	}
}

/**
 * 単一のコイン音を作成・再生する
 * 
 * @param audioContext - Web Audio Context
 * @param frequency - 音の周波数
 * @param duration - 音の長さ（秒）
 */
function createCoinSound(audioContext: AudioContext, frequency: number, duration: number): void {
	// オシレーターを作成（音の生成）
	const oscillator = audioContext.createOscillator();
	const gainNode = audioContext.createGain();

	// オシレーターの設定
	oscillator.type = 'sine';
	oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

	// 音量の設定（フェードアウト効果）
	gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
	gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

	// ノードを接続
	oscillator.connect(gainNode);
	gainNode.connect(audioContext.destination);

	// 音の再生
	oscillator.start(audioContext.currentTime);
	oscillator.stop(audioContext.currentTime + duration);
}

/**
 * ユーザーインタラクション後に音声再生を有効化する
 * （ブラウザの自動再生ポリシー対応）
 */
export function enableAudioContext(): void {
	try {
		if (!window.AudioContext && !(window as any).webkitAudioContext) {
			return;
		}

		const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
		const audioContext = new AudioContext();

		// 無音の音を再生してAudioContextを有効化
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();
		
		gainNode.gain.setValueAtTime(0, audioContext.currentTime);
		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);
		
		oscillator.start(audioContext.currentTime);
		oscillator.stop(audioContext.currentTime + 0.01);

		console.log('Audio context enabled');
	} catch (error) {
		console.error('Failed to enable audio context:', error);
	}
}