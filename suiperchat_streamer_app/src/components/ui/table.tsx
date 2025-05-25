/**
 * テーブルコンポーネント
 *
 * 表形式でデータを表示するためのコンポーネントセットです。
 * TableHeader, TableBody, TableRow, TableHeadなどのサブコンポーネントを含みます。
 *
 * @module components/ui/table
 */

import { cn } from "@/lib/utils";
import * as React from "react";

/**
 * テーブルコンテナコンポーネント
 */
const Table = React.forwardRef<
	HTMLTableElement,
	React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
	<div className="relative w-full overflow-auto">
		<table
			ref={ref}
			className={cn("w-full caption-bottom text-sm", className)}
			{...props}
		/>
	</div>
));
Table.displayName = "Table";

/**
 * テーブルのキャプションコンポーネント
 */
const TableCaption = React.forwardRef<
	HTMLTableCaptionElement,
	React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
	<caption
		ref={ref}
		className={cn("mt-4 text-sm text-muted-foreground", className)}
		{...props}
	/>
));
TableCaption.displayName = "TableCaption";

/**
 * テーブルヘッダーコンポーネント
 */
const TableHeader = React.forwardRef<
	HTMLTableSectionElement,
	React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

/**
 * テーブルボディコンポーネント
 */
const TableBody = React.forwardRef<
	HTMLTableSectionElement,
	React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<tbody
		ref={ref}
		className={cn("[&_tr:last-child]:border-0", className)}
		{...props}
	/>
));
TableBody.displayName = "TableBody";

/**
 * テーブルフッターコンポーネント
 */
const TableFooter = React.forwardRef<
	HTMLTableSectionElement,
	React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<tfoot
		ref={ref}
		className={cn(
			"border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
			className,
		)}
		{...props}
	/>
));
TableFooter.displayName = "TableFooter";

/**
 * テーブル行コンポーネント
 */
const TableRow = React.forwardRef<
	HTMLTableRowElement,
	React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
	<tr
		ref={ref}
		className={cn(
			"border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
			className,
		)}
		{...props}
	/>
));
TableRow.displayName = "TableRow";

/**
 * テーブルヘッダーセルコンポーネント
 */
const TableHead = React.forwardRef<
	HTMLTableCellElement,
	React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
	<th
		ref={ref}
		className={cn(
			"h-8 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
			className,
		)}
		{...props}
	/>
));
TableHead.displayName = "TableHead";

/**
 * テーブルセルコンポーネント
 */
const TableCell = React.forwardRef<
	HTMLTableCellElement,
	React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
	<td
		ref={ref}
		className={cn(
			"px-2 py-1 align-middle [&:has([role=checkbox])]:pr-0",
			className,
		)}
		{...props}
	/>
));
TableCell.displayName = "TableCell";

export {
	Table,
	TableCaption,
	TableHeader,
	TableBody,
	TableFooter,
	TableHead,
	TableRow,
	TableCell,
};
