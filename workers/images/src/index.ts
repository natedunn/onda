// Writes item art into the onda-images R2 bucket. Called by Convex
// (convex/images.ts) only; readers get the files from the bucket's public
// domain, https://img.onda.club, which never runs this Worker.

export interface Env {
	BUCKET: R2Bucket;
	/** Shared with Convex's IMAGES_UPLOAD_TOKEN. `wrangler secret put UPLOAD_TOKEN`. */
	UPLOAD_TOKEN: string;
}

// e.g. album/<mbid>/3f2a9c01d4e8-500.jpg
const KEY = /^[a-z0-9][a-z0-9_-]*(?:\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_-]+\.(?:jpg|png|webp|gif)$/;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 10 * 1024 * 1024;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/") return json(200, { service: "Onda image uploads" });
		if (!url.pathname.startsWith("/objects/")) return json(404, { error: "Not found" });
		if (request.method !== "PUT") return json(405, { error: "Method not allowed" });
		if (!(await authorized(request, env.UPLOAD_TOKEN))) return json(401, { error: "Unauthorized" });

		const key = decodeURIComponent(url.pathname.slice("/objects/".length));
		if (!KEY.test(key)) return json(400, { error: "Bad key" });
		const type = request.headers.get("content-type") ?? "";
		if (!TYPES.has(type)) return json(415, { error: "Unsupported type" });
		const body = await request.arrayBuffer();
		if (!body.byteLength || body.byteLength > MAX_BYTES) return json(413, { error: "Bad size" });

		// Keys are named after their content, so a file never changes once written.
		await env.BUCKET.put(key, body, {
			httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" },
		});
		return json(200, { key });
	},
} satisfies ExportedHandler<Env>;

async function authorized(request: Request, token: string) {
	const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
	if (!token || !given) return false;
	// Compare digests so the check takes the same time however much matches.
	const [a, b] = await Promise.all(
		[given, token].map(async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))),
	);
	return a.every((byte, i) => byte === b[i]);
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}
