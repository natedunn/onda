// Album search over a weekly mirror of MusicBrainz release groups in D1, so
// searches don't depend on musicbrainz.org's rate limits. Called by Convex
// (convex/providers.ts) only. The import (import/run.sh) loads the inactive
// table slot and then flips `meta.active`, so searches never see a half-loaded
// table.

export interface Env {
	DB: D1Database;
	/** Shared with Convex's MUSIC_SEARCH_TOKEN. `wrangler secret put SEARCH_TOKEN`. */
	SEARCH_TOKEN: string;
}

export type Album = { id: string; title: string; artist: string; year: number | null; type: string };

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/") return json(200, { service: "Onda album search" });
		if (url.pathname !== "/search") return json(404, { error: "Not found" });
		if (request.method !== "GET") return json(405, { error: "Method not allowed" });
		if (!(await authorized(request, env.SEARCH_TOKEN))) return json(401, { error: "Unauthorized" });

		const match = toMatch(url.searchParams.get("q") ?? "");
		if (!match) return json(200, { albums: [] });
		const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 8, 1), 25);

		const table = await activeTable(env.DB);
		if (!table) return json(503, { error: "Mirror not loaded" });
		// Rows are stored most notable first and FTS5 returns matches in row order, so
		// a broad query ("the", "love") only scores its first 1000 matches, the
		// well-known ones, instead of all of them. Text match first, notability second.
		const { results } = await env.DB.prepare(
			`SELECT id, title, artist, year, type FROM (
				SELECT id, title, artist, year, type, rank, boost FROM ${table} WHERE ${table} MATCH ?1 LIMIT 1000
			) ORDER BY rank - boost * 0.5 LIMIT ?2`,
		)
			.bind(match, limit)
			.all<Album>();
		return json(200, { albums: results });
	},
} satisfies ExportedHandler<Env>;

/**
 * A user's query as an FTS5 expression: every word must match, the last as a
 * prefix since people are still typing it. Words are quoted so FTS5 syntax in
 * the query is just text.
 */
export function toMatch(query: string): string | null {
	const words = query
		.normalize("NFKC")
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)
		.slice(0, 8);
	if (!words.length || words.join("").length < 2) return null;
	return words.map((w, i) => `"${w}"${i === words.length - 1 ? "*" : ""}`).join(" ");
}

let active: { table: string; at: number } | null = null;

async function activeTable(db: D1Database) {
	if (active && Date.now() - active.at < 60_000) return active.table;
	const row = await db.prepare("SELECT value FROM meta WHERE key = 'active'").first<{ value: string }>();
	if (!row || !/^albums_[ab]$/.test(row.value)) return null;
	active = { table: row.value, at: Date.now() };
	return active.table;
}

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
