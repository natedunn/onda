// Item art is stored as a pointer, not a URL: an image on a source's own
// image host, or our copy in R2 (served from img.onda.club). URLs are built
// here, on the server and in the browser alike, so moving hosts or changing
// sizes never touches stored data. See convex/images.ts for the copying.

/** Public address of the onda-images R2 bucket. */
export const IMAGE_BASE = "https://img.onda.club";

export type SourceImageHost = "tmdb" | "igdb" | "caa" | "openlibrary";
/** An image on its source's host; `id` is that host's own image id. */
export type SourceImage = { host: SourceImageHost; id: string; pinned?: boolean };
/**
 * Our copy in R2, one file per size, smallest first. `from` is the source
 * image it was copied from (absent for uploads). No files means the source
 * had no art.
 */
export type StoredImage = {
	host: "r2";
	files: { path: string; width: number; height: number }[];
	from?: SourceImage;
	pinned?: boolean;
};
export type Image = SourceImage | StoredImage;

type Size = { width: number; url: (id: string) => string };

// Each host's ready-made sizes, smallest first. Widths are what the host
// serves (Open Library's vary a little by book; these are typical).
export const SOURCE_SIZES: Record<SourceImageHost, Size[]> = {
	tmdb: [92, 154, 185, 342, 500, 780].map((width) => ({
		width,
		url: (id) => `https://image.tmdb.org/t/p/w${width}${id}`,
	})),
	igdb: [
		[90, "t_cover_small"],
		[264, "t_cover_big"],
		[528, "t_cover_big_2x"],
	].map(([width, name]) => ({
		width: width as number,
		url: (id) => `https://images.igdb.com/igdb/image/upload/${name}/${id}.jpg`,
	})),
	caa: [250, 500, 1200].map((width) => ({
		width,
		url: (id) => `https://coverartarchive.org/release-group/${id}/front-${width}`,
	})),
	openlibrary: [
		[180, "M"],
		[330, "L"],
	].map(([width, name]) => ({
		width: width as number,
		url: (id) => `https://covers.openlibrary.org/b/id/${id}-${name}.jpg`,
	})),
};

/** Sources whose art we copy to R2. TMDB's own CDN is fast, so its posters stay there. */
export const COPIED_HOSTS: SourceImageHost[] = ["igdb", "caa", "openlibrary"];
/** The sizes copied for each of those: one for lists, one for item pages and grids. */
export const COPIED_SIZES: Record<string, number[]> = { igdb: [264, 528], caa: [250, 500], openlibrary: [180, 330] };

// Records saved before images were pointers hold plain URLs; read them as-is
// until the migration (images:migrateUrls) has run everywhere.
export type AnyImage = Image | string | undefined | null;

function sizesOf(image: Image): Size[] {
	if (image.host === "r2") return image.files.map((f) => ({ width: f.width, url: () => `${IMAGE_BASE}/${f.path}` }));
	return SOURCE_SIZES[image.host];
}

export function hasArt(image: AnyImage): boolean {
	if (!image) return false;
	return typeof image === "string" || sizesOf(image).length > 0;
}

/** The smallest size at least `width` pixels wide (or the largest there is). */
export function imageUrl(image: AnyImage, width: number): string | undefined {
	if (!image) return undefined;
	if (typeof image === "string") return image;
	const sizes = sizesOf(image);
	const id = image.host === "r2" ? "" : image.id;
	return (sizes.find((s) => s.width >= width) ?? sizes.at(-1))?.url(id);
}

export function imageSrcSet(image: AnyImage): string | undefined {
	if (!image || typeof image === "string") return undefined;
	const id = image.host === "r2" ? "" : image.id;
	return sizesOf(image)
		.map((s) => `${s.url(id)} ${s.width}w`)
		.join(", ");
}

/** Same picture: equal source images, or a copy and the source image it was made from. */
export function sameSourceImage(a: SourceImage | undefined, b: SourceImage | undefined) {
	return Boolean(a && b && a.host === b.host && a.id === b.id);
}

/** Reads one of the URLs records used to store as a pointer. */
export function parseImageUrl(url: string): SourceImage | undefined {
	const patterns: [SourceImageHost, RegExp][] = [
		["tmdb", /^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+(\/[^/]+)$/],
		["igdb", /^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/[a-z0-9_]+\/([^/.]+)\.\w+$/],
		["caa", /^https:\/\/coverartarchive\.org\/release-group\/([0-9a-f-]{36})\/front/],
		["openlibrary", /^https:\/\/covers\.openlibrary\.org\/b\/id\/(\d+)-[SML]\.jpg$/],
	];
	for (const [host, pattern] of patterns) {
		const match = url.match(pattern);
		if (match) return { host, id: match[1]! };
	}
	return undefined;
}
