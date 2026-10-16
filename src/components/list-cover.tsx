import { meshGradient } from "@convex/shared/themes";
import { cn } from "@/lib/utils";

/** The square, album-cover-like gradient tile that stands in for a list. */
export function ListCover({
	theme,
	seed,
	emoji,
	className,
	emojiClassName,
	framed = false,
}: {
	theme: string;
	seed: number;
	emoji?: string;
	className?: string;
	emojiClassName?: string;
	/** Ink border with a halftone drop shadow, for the larger "hero" tiles. */
	framed?: boolean;
}) {
	const tile = (
		<div
			className={cn(
				"grain grid aspect-square shrink-0 place-items-center overflow-hidden",
				framed ? "w-full border border-ink" : className,
			)}
			style={meshGradient(theme, seed)}
		>
			{emoji && (
				<span className={cn("relative z-10 drop-shadow-sm select-none", emojiClassName)} aria-hidden>
					{emoji}
				</span>
			)}
		</div>
	);
	// The tile isolates itself for the grain overlay, so the shadow lives on a wrapper.
	return framed ? <div className={cn("halftone shrink-0", className)}>{tile}</div> : tile;
}
