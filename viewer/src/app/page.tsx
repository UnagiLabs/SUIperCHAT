"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

// Dynamically import the HomePage component with ssr: false
const HomePage = dynamic(() => import("@/components/home-page"), {
	ssr: false,
	loading: () => <div>Loading page content...</div>, // Add a basic loading indicator
});

export default function Page() {
	return (
		<Suspense fallback={<div>Loading...</div>}>
			<HomePage />
		</Suspense>
	);
}
