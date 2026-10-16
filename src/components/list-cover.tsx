import { meshGradient } from "@convex/shared/themes";
import { cn } from "@/lib/utils";

/** The square, album-cover-like gradient tile that stands in for a list. */
export function ListCover({
	theme,
	seed,
	emoji,
	className,
	emojiClassName,
}: {
	theme: string;
	seed: number;
	emoji?: string;
	className?: string;
	emojiClassName?: string;
}) {
	return (
		<div
			className={cn("grain grid aspect-square shrink-0 place-items-center overflow-hidden", className)}
			style={meshGradient(theme, seed)}
		>
			{emoji && (
				<span className={cn("relative z-10 drop-shadow-sm select-none", emojiClassName)} aria-hidden>
					{emoji}
				</span>
			)}
		</div>
	);
}
