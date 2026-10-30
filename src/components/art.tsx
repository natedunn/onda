import { type AnyImage, hasArt, imageSrcSet, imageUrl } from "@convex/shared/images";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Item artwork. Albums are square; everything else is a 2:3 poster. `sizes`
 * is how wide it renders (as for <img sizes>), so the browser picks the
 * smallest file that's sharp enough. `priority` is for art above the fold.
 */
export function Art({
	image,
	kind,
	alt,
	sizes,
	priority,
	className,
}: {
	image?: AnyImage;
	kind: string;
	alt: string;
	sizes: string;
	priority?: boolean;
	className?: string;
}) {
	const [failed, setFailed] = useState(false);
	// Above-the-fold art shows as soon as it arrives; the rest fades in as it scrolls into view.
	const [loaded, setLoaded] = useState(Boolean(priority));
	const shape = kind === "album" ? "aspect-square" : "aspect-[2/3]";
	if (!hasArt(image) || failed) {
		return (
			<div
				className={cn(
					shape,
					"grid shrink-0 place-items-center border border-rule bg-paper-2 text-[10px] text-muted uppercase",
					className,
				)}
			>
				{kind}
			</div>
		);
	}
	return (
		<div className={cn(shape, "shrink-0 overflow-hidden border border-rule bg-paper-2", className)}>
			<img
				// Server-rendered images can finish (or fail) before React attaches its handlers.
				ref={(img) => {
					if (!img?.complete) return;
					if (img.naturalWidth) setLoaded(true);
					else setFailed(true);
				}}
				src={imageUrl(image, 342)}
				srcSet={imageSrcSet(image)}
				sizes={sizes}
				alt={alt}
				loading={priority ? "eager" : "lazy"}
				fetchPriority={priority ? "high" : undefined}
				decoding="async"
				onLoad={() => setLoaded(true)}
				onError={() => setFailed(true)}
				className={cn("size-full object-cover transition-opacity duration-300", !loaded && "opacity-0")}
			/>
		</div>
	);
}
