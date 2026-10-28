import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The top of a page (a list, a profile), above a ControlStrip. */
export function PageHero({ children }: { children: ReactNode }) {
	return <section className="pb-8">{children}</section>;
}

/** The edge-to-edge strip of controls under a PageHero. Same height whether or not it holds a select. */
export function ControlStrip({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<nav
			className={cn(
				"-mx-5 flex min-h-15 flex-wrap items-center justify-between gap-3 border-y border-rule px-5 py-3 text-[12px] sm:-mx-8 sm:px-8",
				className,
			)}
		>
			{children}
		</nav>
	);
}
