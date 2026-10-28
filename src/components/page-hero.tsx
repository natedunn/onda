import { getTheme, meshLayout } from "@convex/shared/themes";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The top of a page (a list, a profile): runs edge to edge from the site header's rule
 * down to a ControlStrip, over a faint halftone.
 */
export function PageHero({ children }: { children: ReactNode }) {
	return (
		<section className="relative isolate -mx-5 -mt-10 px-5 pt-10 pb-8 sm:-mx-8 sm:px-8">
			<div aria-hidden className="absolute inset-0 -z-10 [container-type:size]">
				<div className="halftone-wash size-full" style={HALFTONE_WASH} />
			</div>
			{children}
		</section>
	);
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

// One fixed halftone behind every hero, taken from a "fair" mesh that looked right.
const HALFTONE_WASH = halftoneWash("fair", 1404878010);

/**
 * Layers for `.halftone-wash`: a 6px dot screen over the list's mesh redrawn in greys.
 * The mesh is laid out as a square as wide as the section (cropped through its middle),
 * so its blobs keep the shape and placement they have on the cover. Each theme's colors
 * are ranked by brightness onto the same light ramp, so every list gets the same gentle
 * range of dot sizes. In dark mode the ramp flips, so (after the CSS invert) light dots
 * grow where the cover is light.
 */
function halftoneWash(themeId: string, seed: number): React.CSSProperties {
	const luminance = getTheme(themeId).colors.map(relativeLuminance);
	const min = Math.min(...luminance);
	const max = Math.max(...luminance);
	const grey = (t: number) => {
		const v = Math.round((0.72 + 0.28 * t) * 255);
		return `rgb(${v} ${v} ${v})`;
	};
	const greys = luminance.map((l) => {
		const t = max > min ? (l - min) / (max - min) : 1;
		return `light-dark(${grey(t)}, ${grey(1 - t)})`;
	});
	const { base, blobs } = meshLayout(seed);
	const mesh = (all: string) => blobs.map(() => all);
	return {
		backgroundColor: greys[base],
		backgroundImage: [
			"radial-gradient(circle, #777, #fff)",
			...blobs.map((b) => `radial-gradient(circle at ${b.x}% ${b.y}%, ${greys[b.color]} 0%, transparent ${b.size}%)`),
		].join(", "),
		backgroundSize: ["6px 6px", ...mesh("100cqw 100cqw")].join(", "),
		backgroundPosition: ["0 0", ...mesh("center")].join(", "),
		backgroundRepeat: ["repeat", ...mesh("no-repeat")].join(", "),
		backgroundBlendMode: ["multiply", ...mesh("normal")].join(", "),
	};
}

function relativeLuminance(hex: string) {
	const n = Number.parseInt(hex.slice(1), 16);
	const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
		const s = c / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
