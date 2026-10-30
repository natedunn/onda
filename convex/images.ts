// Copies item art from slow source hosts (Cover Art Archive and Open Library
// sit behind archive.org; IGDB asks apps to store what they use) into the
// onda-images R2 bucket, served from img.onda.club. A record is copied once
// it's on a list, so search results that nobody saves are never fetched.
// Uploads go through the onda-images Worker (workers/images), which holds the
// bucket binding. See convex/shared/images.ts for how pointers become URLs.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { vImage } from "./schema";
import {
	COPIED_HOSTS,
	COPIED_SIZES,
	type Image,
	SOURCE_SIZES,
	type SourceImage,
	sameSourceImage,
	type StoredImage,
} from "./shared/images";

const USER_AGENT = "Onda/0.1 (https://github.com/natedunn/onda)";

type RecordImage = Doc<"records">["image"];

const isCopyable = (image: RecordImage): image is SourceImage =>
	image !== undefined && image.host !== "r2" && COPIED_HOSTS.includes(image.host);

/**
 * The image a refreshed record should keep. A hand-set image stays; so does
 * our copy of the image the source still points at.
 */
export function mergeImage(existing: RecordImage, incoming: RecordImage): RecordImage {
	if (!existing) return incoming;
	if (existing.pinned || !incoming) return existing;
	if (existing.host === "r2" && incoming.host !== "r2") {
		if (sameSourceImage(existing.from, incoming)) return existing;
	}
	return incoming;
}

/** Queues a copy of the record's art to R2, if it's from a copied host and the record is on a list. */
export async function copyWhenListed(ctx: MutationCtx, record: Doc<"records">) {
	if (!isCopyable(record.image)) return;
	const listed = await ctx.db
		.query("items")
		.withIndex("by_record", (q) => q.eq("recordId", record._id))
		.first();
	if (listed) await ctx.scheduler.runAfter(0, internal.images.copy, { recordId: record._id });
}

export const copyTarget = internalQuery({
	args: { recordId: v.id("records") },
	handler: async (ctx, { recordId }) => {
		const record = await ctx.db.get(recordId);
		if (!record || !isCopyable(record.image)) return null;
		return { kind: record.kind, sourceId: record.sourceId, image: record.image };
	},
});

export const copy = internalAction({
	args: { recordId: v.id("records") },
	handler: async (ctx, { recordId }) => {
		const base = process.env.IMAGES_UPLOAD_URL;
		const token = process.env.IMAGES_UPLOAD_TOKEN;
		// Not configured (e.g. a fresh local backend): records keep the source's URLs.
		if (!base || !token) return;
		const target = await ctx.runQuery(internal.images.copyTarget, { recordId });
		if (!target) return;
		const { image } = target;

		const downloads: { bytes: ArrayBuffer; type: string }[] = [];
		for (const size of SOURCE_SIZES[image.host].filter((s) => COPIED_SIZES[image.host]!.includes(s.width))) {
			let url = size.url(image.id);
			// Open Library answers a missing cover with a blank 1×1 image unless asked not to.
			if (image.host === "openlibrary") url += "?default=false";
			const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": USER_AGENT } });
			const type = res.headers.get("content-type")?.split(";")[0] ?? "";
			// The source has no art at this size; keep whichever smaller sizes it had.
			if (res.status === 404) break;
			if (!res.ok || !type.startsWith("image/")) throw new Error(`${new URL(url).host} responded ${res.status} ${type}`);
			downloads.push({ bytes: await res.arrayBuffer(), type });
		}

		// Name files after the largest one's content, so a new picture gets new
		// URLs and caches never serve an old one.
		const largest = downloads.at(-1);
		const hash = largest ? hex(await crypto.subtle.digest("SHA-256", largest.bytes)).slice(0, 12) : "";
		const files: StoredImage["files"] = [];
		for (const { bytes, type } of downloads) {
			const size = imageSize(new Uint8Array(bytes));
			if (!size) throw new Error(`unreadable ${type} from ${image.host}/${image.id}`);
			const path = `${target.kind}/${target.sourceId}/${hash}-${size.width}.${EXTENSIONS[type] ?? "img"}`;
			const res = await fetch(`${base}/objects/${path}`, {
				method: "PUT",
				headers: { Authorization: `Bearer ${token}`, "Content-Type": type },
				body: bytes,
			});
			if (!res.ok) throw new Error(`image upload responded ${res.status}`);
			files.push({ path, ...size });
		}
		await ctx.runMutation(internal.images.saveCopy, { recordId, image: { host: "r2", files, from: image } });
	},
});

export const saveCopy = internalMutation({
	args: { recordId: v.id("records"), image: vImage },
	handler: async (ctx, { recordId, image }) => {
		const record = await ctx.db.get(recordId);
		if (!record || image.host !== "r2") return;
		// The record moved on to another image while this one was copying.
		if (!isCopyable(record.image) || !sameSourceImage(record.image, image.from)) return;
		await ctx.db.patch(recordId, { image: { ...image, pinned: record.image.pinned } });
	},
});

/** Points a record at a new image by hand (an editor or agent); refreshes from the source won't replace it. */
export const setImage = internalMutation({
	args: { recordId: v.id("records"), image: v.union(vImage, v.null()) },
	handler: async (ctx, { recordId, image }) => {
		const record = await ctx.db.get(recordId);
		if (!record) throw new Error("Unknown record");
		const next: Image | undefined = image ? { ...image, pinned: true } : undefined;
		await ctx.db.patch(recordId, { image: next });
		if (next) await copyWhenListed(ctx, { ...record, image: next });
	},
});

const EXTENSIONS: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
};

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Pixel size from a JPEG, PNG, GIF or WebP header. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
	const u16 = (i: number) => (b[i]! << 8) | b[i + 1]!;
	const u16le = (i: number) => b[i]! | (b[i + 1]! << 8);
	const u24le = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
	const u32 = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
	const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

	if (b[0] === 0x89 && ascii(1, 3) === "PNG") return { width: u32(16), height: u32(20) };
	if (ascii(0, 3) === "GIF") return { width: u16le(6), height: u16le(8) };
	if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
		const chunk = ascii(12, 4);
		if (chunk === "VP8X") return { width: u24le(24) + 1, height: u24le(27) + 1 };
		if (chunk === "VP8 ") return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
		if (chunk === "VP8L") {
			const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
			return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
		}
		return null;
	}
	if (b[0] === 0xff && b[1] === 0xd8) {
		// Walk the segments to a start-of-frame marker (SOF0–SOF15, minus DHT/JPG/DAC).
		let i = 2;
		while (i + 9 < b.length) {
			if (b[i] !== 0xff) return null;
			const marker = b[i + 1]!;
			if (marker === 0xff) {
				i++;
				continue;
			}
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
				return { width: u16(i + 7), height: u16(i + 5) };
			}
			i += 2 + u16(i + 2);
		}
	}
	return null;
}
