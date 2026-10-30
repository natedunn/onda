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

type MaybeImage = Image | undefined | null;

function sizesOf(image: Image): Size[] {
	if (image.host === "r2") return image.files.map((f) => ({ width: f.width, url: () => `${IMAGE_BASE}/${f.path}` }));
	return SOURCE_SIZES[image.host];
}

export function hasArt(image: MaybeImage): boolean {
	if (!image) return false;
	return sizesOf(image).length > 0;
}

/** The smallest size at least `width` pixels wide (or the largest there is). */
export function imageUrl(image: MaybeImage, width: number): string | undefined {
	if (!image) return undefined;
	const sizes = sizesOf(image);
	const id = image.host === "r2" ? "" : image.id;
	return (sizes.find((s) => s.width >= width) ?? sizes.at(-1))?.url(id);
}

export function imageSrcSet(image: MaybeImage): string | undefined {
	if (!image) return undefined;
	const id = image.host === "r2" ? "" : image.id;
	return sizesOf(image)
		.map((s) => `${s.url(id)} ${s.width}w`)
		.join(", ");
}

/** Same picture: equal source images, or a copy and the source image it was made from. */
export function sameSourceImage(a: SourceImage | undefined, b: SourceImage | undefined) {
	return Boolean(a && b && a.host === b.host && a.id === b.id);
}
