/**
 * スタンプアニメーションコンポーネント
 * 
 * ユーザーが選択したスタンプを画面上にアニメーション表示します。
 * スタンプが送信されると、画面下部から上部へフロートアップし、
 * フェードアウトするアニメーションを実行します。
 */
"use client";

import { Heart, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";

interface StampItem {
	id: string;
	stampId: string;
	x: number;
	startTime: number;
}

const STAMP_CONFIG = {
	heart: { icon: Heart, color: "text-red-500" },
	like: { icon: ThumbsUp, color: "text-blue-500" },
	star: { icon: Star, color: "text-yellow-500" },
	poop: { icon: () => <span className="text-4xl">💩</span>, color: "" },
	dislike: { icon: ThumbsDown, color: "text-gray-500" },
};

export function StampAnimation() {
	const [stamps, setStamps] = useState<StampItem[]>([]);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		const handleStampSent = (event: CustomEvent<{ stampId: string }>) => {
			const newStamp: StampItem = {
				id: `${Date.now()}-${Math.random()}`,
				stampId: event.detail.stampId,
				x: Math.random() * 80 + 10, // 10% to 90% of screen width
				startTime: Date.now(),
			};
			
			setStamps((prev) => [...prev, newStamp]);

			// 4秒後に削除（アニメーション時間と同期）
			setTimeout(() => {
				setStamps((prev) => prev.filter((stamp) => stamp.id !== newStamp.id));
			}, 4000);
		};

		window.addEventListener("stampSent" as any, handleStampSent);
		return () => {
			window.removeEventListener("stampSent" as any, handleStampSent);
		};
	}, []);

	if (!mounted) {
		return null;
	}

	return (
		<div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
			{stamps.map((stamp) => {
				const config = STAMP_CONFIG[stamp.stampId as keyof typeof STAMP_CONFIG];
				if (!config) return null;

				const Icon = config.icon;
				return (
					<div
						key={stamp.id}
						className="absolute animate-float-up animate-bounce-in"
						style={{
							left: `${stamp.x}%`,
							bottom: "5%",
							animationDuration: "4s",
							animationTimingFunction: "ease-out",
							animationDelay: "0.2s", // bounce-inの後にfloat-upを開始
							zIndex: 1000,
						}}
					>
						<div className="relative">
							{typeof Icon === "function" && Icon.name !== "Icon" ? (
								<Icon />
							) : (
								<Icon className={`h-16 w-16 ${config.color} drop-shadow-2xl filter brightness-110`} />
							)}
							{/* 輝きエフェクト */}
							<div className="absolute inset-0 animate-pulse bg-white/20 rounded-full blur-lg" />
						</div>
					</div>
				);
			})}
		</div>
	);
}