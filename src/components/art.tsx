import { useState } from "react";
import { cn } from "@/lib/utils";

/** Item artwork. Albums are square; everything else is a 2:3 poster. */
export function Art({
	src,
	kind,
	alt,
	className,
}: {
	src?: string;
	kind: string;
	alt: string;
	className?: string;
}) {
	const [failed, setFailed] = useState(false);
	const shape = kind === "album" ? "aspect-square" : "aspect-[2/3]";
	if (!src || failed) {
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
		<img
			src={src}
			alt={alt}
			loading="lazy"
			onError={() => setFailed(true)}
			className={cn(shape, "shrink-0 border border-rule bg-paper-2 object-cover", className)}
		/>
	);
}
