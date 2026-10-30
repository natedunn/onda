"use node";

import { Resvg } from "@resvg/resvg-js";
import { v } from "convex/values";
import satori from "satori";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { imageUrl } from "./shared/images";
import { meshGradient } from "./shared/themes";

const WIDTH = 1200;
const HEIGHT = 630;
const PAPER = "#fbfaf6";
const INK = "#151513";
const MUTED = "#6d6b65";

const FONT_BASE = "https://cdn.jsdelivr.net/fontsource/fonts";
const FONTS = [
	{ name: "Serif", file: "instrument-serif@latest/latin-400-normal.woff", weight: 400, style: "normal" },
	{ name: "Serif", file: "instrument-serif@latest/latin-400-italic.woff", weight: 400, style: "italic" },
	{ name: "Sans", file: "inter@latest/latin-400-normal.woff", weight: 400, style: "normal" },
	{ name: "Sans", file: "inter@latest/latin-700-normal.woff", weight: 700, style: "normal" },
] as const;

// Module scope survives between invocations on a warm Node runtime.
let fontCache: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" | "italic" }[]> | null =
	null;

function loadFonts() {
	fontCache ??= Promise.all(
		FONTS.map(async (font) => {
			const res = await fetch(`${FONT_BASE}/${font.file}`);
			if (!res.ok) throw new Error(`font ${font.file}: ${res.status}`);
			return { name: font.name, data: await res.arrayBuffer(), weight: font.weight, style: font.style };
		}),
	).catch((error) => {
		fontCache = null;
		throw error;
	});
	return fontCache;
}

async function toDataUri(url: string | undefined) {
	if (!url) return null;
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		const type = res.headers.get("content-type") ?? "";
		if (!res.ok || !type.startsWith("image/")) return null;
		return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
	} catch {
		return null;
	}
}

/** Twemoji file name for an emoji, e.g. "🎃" → "1f383". */
function twemojiCode(emoji: string) {
	const points = [...emoji].map((c) => c.codePointAt(0)!.toString(16));
	return (emoji.includes("‍") ? points : points.filter((p) => p !== "fe0f")).join("-");
}

async function emojiAsset(segment: string) {
	return (
		(await toDataUri(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${twemojiCode(segment)}.svg`)) ??
		""
	);
}

// Satori takes React-element-shaped objects; this avoids pulling React in here.
type Node = { type: string; props: Record<string, unknown> };
function h(type: string, style: Record<string, unknown>, ...children: unknown[]): Node {
	return { type, props: { style: { display: "flex", ...style }, children } };
}
function img(src: string, style: Record<string, unknown>): Node {
	return { type: "img", props: { src, style } };
}

function clip(text: string, max: number) {
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export const listImageUrl = action({
	args: { slug: v.string() },
	handler: async (ctx, { slug }): Promise<string | null> => {
		const list = await ctx.runQuery(internal.og.listForImage, { slug });
		if (!list) return null;
		const cachedUrl = await ctx.runQuery(internal.og.cached, { listId: list.listId, version: list.version });
		if (cachedUrl) return cachedUrl;

		const [fonts, covers] = await Promise.all([
			loadFonts(),
			Promise.all(list.covers.map(async (c) => ({ kind: c.kind, src: await toDataUri(imageUrl(c.image, 200)) }))),
		]);
		const gradient = meshGradient(list.theme, list.seed);

		const tile = h(
			"div",
			{
				width: 400,
				height: 400,
				flexShrink: 0,
				alignItems: "center",
				justifyContent: "center",
				border: `3px solid ${INK}`,
				boxShadow: `10px 10px 0 ${INK}`,
				...gradient,
			},
			list.emoji ? h("div", { fontSize: 170, lineHeight: 1 }, list.emoji) : "",
		);

		const coverRow = h(
			"div",
			{ gap: 14, alignItems: "flex-end" },
			...covers
				.filter((c) => c.src)
				.slice(0, 5)
				.map((c) =>
					img(c.src!, {
						width: 92,
						height: c.kind === "album" ? 92 : 138,
						objectFit: "cover",
						border: `1px solid ${INK}`,
					}),
				),
		);

		const tree = h(
			"div",
			{ width: WIDTH, height: HEIGHT, background: PAPER, color: INK, fontFamily: "Sans" },
			// A thin band of the list's colors along the top edge, like the site.
			h("div", { position: "absolute", top: 0, left: 0, width: WIDTH, height: 14, ...gradient }),
			h(
				"div",
				{ width: WIDTH, height: HEIGHT, padding: "84px 72px 64px", gap: 64 },
				tile,
				h(
					"div",
					{ flexDirection: "column", flexGrow: 1, minWidth: 0, height: 400, justifyContent: "space-between" },
					h(
						"div",
						{ flexDirection: "column" },
						h("div", { fontFamily: "Serif", fontStyle: "italic", fontSize: 40, lineHeight: 1 }, "onda"),
						h(
							"div",
							{ fontFamily: "Serif", fontSize: list.name.length > 40 ? 64 : 84, lineHeight: 0.95, marginTop: 28 },
							clip(list.name, 80),
						),
						h(
							"div",
							{ fontSize: 22, color: MUTED, marginTop: 18 },
							[
								list.owner ? `by @${list.owner}` : null,
								`${list.itemCount} ${list.itemCount === 1 ? "item" : "items"}`,
								list.ranked ? "ranked" : null,
							]
								.filter(Boolean)
								.join("  ·  "),
						),
					),
					coverRow,
				),
			),
		);

		const svg = await satori(tree as never, {
			width: WIDTH,
			height: HEIGHT,
			fonts: fonts as never,
			loadAdditionalAsset: async (code, segment) => (code === "emoji" ? await emojiAsset(segment) : ""),
		});
		const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
		const storageId = await ctx.storage.store(new Blob([new Uint8Array(png)], { type: "image/png" }));
		return await ctx.runMutation(internal.og.save, { listId: list.listId, version: list.version, storageId });
	},
});
