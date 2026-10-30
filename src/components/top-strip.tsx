import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { getTheme, MESH_BLOBS, meshLayout, randomSeed } from "@convex/shared/themes";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useRef, useState } from "react";

const LIGHT = getTheme("paper").colors;
const DARK = getTheme("deep-space").colors;

const IMAGE = Array.from(
	{ length: MESH_BLOBS },
	(_, i) => `radial-gradient(circle at var(--mesh-x${i}) var(--mesh-y${i}), var(--mesh-c${i}) 0%, transparent var(--mesh-s${i}))`,
).join(", ");

const PROPERTIES = [
	"--mesh-base",
	...Array.from({ length: MESH_BLOBS }, (_, i) => [`--mesh-x${i}`, `--mesh-y${i}`, `--mesh-s${i}`, `--mesh-c${i}`]).flat(),
].join(", ");

/**
 * A sliver of gradient across the top of the window. On a list it shows the list's own
 * mesh; elsewhere a paper one (deep space in dark mode) that reshuffles on every navigation.
 * It stays mounted, so it tweens from one mesh to the next.
 */
export function TopStrip() {
	const { slug } = useParams({ strict: false });
	const { data } = useQuery(convexQuery(api.lists.get, slug ? { slug } : "skip"));
	const list = slug && data ? data.list : null;

	// A fixed seed for the first render so the server and the client agree.
	const pathname = useLocation({ select: (l) => l.pathname });
	const [seed, setSeed] = useState(29);
	const first = useRef(true);
	useEffect(() => {
		if (first.current) {
			first.current = false;
			return;
		}
		setSeed(randomSeed());
	}, [pathname]);

	const { base, blobs } = meshLayout(list ? list.seed : seed);
	const listColors = list ? getTheme(list.theme).colors : null;
	const color = (i: number) => (listColors ? listColors[i] : `light-dark(${LIGHT[i]}, ${DARK[i]})`);

	const style: Record<string, string> = { "--mesh-base": color(base) };
	blobs.forEach((b, i) => {
		style[`--mesh-x${i}`] = `${b.x}%`;
		style[`--mesh-y${i}`] = `${b.y}%`;
		style[`--mesh-s${i}`] = `${b.size}%`;
		style[`--mesh-c${i}`] = color(b.color);
	});

	return (
		<div
			aria-hidden
			className="fixed inset-x-0 top-0 z-60 h-1.5 bg-(--mesh-base) duration-500 ease-in-out motion-reduce:transition-none"
			style={{ ...style, backgroundImage: IMAGE, transitionProperty: PROPERTIES } as CSSProperties}
		/>
	);
}
