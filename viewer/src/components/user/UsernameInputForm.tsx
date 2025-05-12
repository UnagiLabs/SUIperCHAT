/**
 * ユーザー名入力フォームコンポーネント
 *
 * ユーザーが初めてアプリケーションを利用する際に表示される名前入力フォーム。
 * 入力された名前はUserContextに保存され、その後のメッセージ送信に使用されます。
 *
 * @module components/user/UsernameInputForm
 */

"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useUser } from "@/context/UserContext";
import { zodResolver } from "@hookform/resolvers/zod";
import type React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// バリデーションスキーマ
const form_schema = z.object({
	username: z
		.string()
		.min(1, "Please enter your name")
		.max(20, "Name must be within 20 characters")
		.refine((name) => !/[<>]/.test(name), {
			message: "Contains invalid characters",
		}),
});

// フォーム値の型
type FormValues = z.infer<typeof form_schema>;

/**
 * ユーザー名入力フォームコンポーネント
 *
 * @returns ユーザー名入力フォームのJSXエレメント
 */
export function UsernameInputForm(): React.ReactElement {
	const { setUsername } = useUser();

	// フォームの設定
	const form = useForm<FormValues>({
		resolver: zodResolver(form_schema),
		defaultValues: {
			username: "",
		},
	});

	/**
	 * フォーム送信ハンドラー
	 *
	 * @param values - フォームの入力値
	 */
	const on_submit = (values: FormValues) => {
		setUsername(values.username);
	};

	return (
		<Card className="w-full max-w-md mx-auto">
			<CardHeader>
				<CardTitle className="text-2xl text-center">
					Welcome to SUIperCHAT
				</CardTitle>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(on_submit)} className="space-y-6">
						<FormField
							control={form.control}
							name="username"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Display Name</FormLabel>
									<FormControl>
										<Input placeholder="Your name" {...field} />
									</FormControl>
									<FormDescription>
										This name will be displayed with your message in the stream
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button type="submit" className="w-full">
							Get Started
						</Button>
					</form>
				</Form>
			</CardContent>
			<CardFooter className="text-sm text-center text-muted-foreground">
				<p className="w-full">
					Wallet connection is required only for sending SUI tips.
					<br />
					You can send messages without connecting your wallet.
				</p>
			</CardFooter>
		</Card>
	);
}
