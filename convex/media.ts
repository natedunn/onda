import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation, query } from "./_generated/server";
import { vKind, vSource } from "./schema";
import type { Kind } from "./shared/constants";

type RecordInput = Omit<Doc<"records">, "_id" | "_creationTime">;

const USER_AGENT = "Onda/0.1 (https://github.com/natedunn/onda)";

function yearOf(date: string | number | undefined | null) {
	if (!date) return undefined;
	// Numbers are either a bare year (Open Library) or unix seconds (IGDB).
	const year =
		typeof date === "number"
			? date < 10_000
				? date
				: new Date(date * 1000).getUTCFullYear()
			: Number(String(date).slice(0, 4));
	return Number.isFinite(year) && year > 0 ? year : undefined;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, {
		...init,
		headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init?.headers },
	});
	if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
	return (await res.json()) as T;
}

// --- TMDB (movies + shows) -------------------------------------------------

function tmdb(path: string, params: Record<string, string> = {}) {
	const key = process.env.TMDB_API_KEY!;
	const url = new URL(`https://api.themoviedb.org/3${path}`);
	for (const [k, val] of Object.entries(params)) url.searchParams.set(k, val);
	// Long keys are v4 read-access tokens; short ones are v3 api keys.
	const isBearer = key.length > 40;
	if (!isBearer) url.searchParams.set("api_key", key);
	return getJson<any>(url.toString(), {
		headers: isBearer ? { Authorization: `Bearer ${key}` } : {},
	});
}

const poster = (path?: string | null) =>
	path ? `https://image.tmdb.org/t/p/w500${path}` : undefined;

async function searchMovies(query: string): Promise<RecordInput[]> {
	const { results = [] } = await tmdb("/search/movie", { query, include_adult: "false" });
	return await Promise.all(
		results.slice(0, 8).map(async (m: any, i: number) => {
			// Directors need a second call; only worth it for the top hits.
			let creators: string[] = [];
			if (i < 5) {
				const credits = await tmdb(`/movie/${m.id}/credits`).catch(() => null);
				creators = (credits?.crew ?? [])
					.filter((c: any) => c.job === "Director")
					.map((c: any) => c.name)
					.slice(0, 2);
			}
			return {
				kind: "movie" as const,
				source: "tmdb" as const,
				sourceId: `movie:${m.id}`,
				title: m.title,
				creators,
				year: yearOf(m.release_date),
				image: poster(m.poster_path),
				url: `https://www.themoviedb.org/movie/${m.id}`,
			};
		}),
	);
}

async function searchShows(query: string): Promise<RecordInput[]> {
	const { results = [] } = await tmdb("/search/tv", { query, include_adult: "false" });
	return await Promise.all(
		results.slice(0, 8).map(async (s: any, i: number) => {
			let creators: string[] = [];
			if (i < 5) {
				const detail = await tmdb(`/tv/${s.id}`).catch(() => null);
				creators = (detail?.created_by ?? []).map((c: any) => c.name).slice(0, 2);
			}
			return {
				kind: "show" as const,
				source: "tmdb" as const,
				sourceId: `tv:${s.id}`,
				title: s.name,
				creators,
				year: yearOf(s.first_air_date),
				image: poster(s.poster_path),
				url: `https://www.themoviedb.org/tv/${s.id}`,
			};
		}),
	);
}

// --- Open Library (books) --------------------------------------------------

async function searchBooks(query: string): Promise<RecordInput[]> {
	const url = new URL("https://openlibrary.org/search.json");
	url.searchParams.set("q", query);
	url.searchParams.set("limit", "8");
	url.searchParams.set("fields", "key,title,subtitle,author_name,first_publish_year,cover_i");
	const { docs = [] } = await getJson<any>(url.toString());
	return docs.map((b: any) => ({
		kind: "book" as const,
		source: "openlibrary" as const,
		sourceId: String(b.key).replace("/works/", ""),
		title: b.title,
		subtitle: b.subtitle,
		creators: (b.author_name ?? []).slice(0, 3),
		year: yearOf(b.first_publish_year),
		image: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg` : undefined,
		url: `https://openlibrary.org${b.key}`,
	}));
}

// --- MusicBrainz + Cover Art Archive (albums) ------------------------------

async function searchAlbums(query: string): Promise<RecordInput[]> {
	const url = new URL("https://musicbrainz.org/ws/2/release-group/");
	url.searchParams.set("query", query);
	url.searchParams.set("dismax", "true");
	url.searchParams.set("limit", "15");
	url.searchParams.set("fmt", "json");
	const { "release-groups": groups = [] } = await getJson<any>(url.toString());
	return groups
		.filter((g: any) => ["Album", "EP"].includes(g["primary-type"]))
		.slice(0, 8)
		.map((g: any) => ({
			kind: "album" as const,
			source: "musicbrainz" as const,
			sourceId: g.id,
			title: g.title,
			subtitle: g["primary-type"] === "EP" ? "EP" : undefined,
			creators: [
				(g["artist-credit"] ?? [])
					.map((a: any) => `${a.name}${a.joinphrase ?? ""}`)
					.join(""),
			].filter(Boolean),
			year: yearOf(g["first-release-date"]),
			image: `https://coverartarchive.org/release-group/${g.id}/front-500`,
			url: `https://musicbrainz.org/release-group/${g.id}`,
		}));
}

// --- IGDB (games) ----------------------------------------------------------

let igdbToken: { value: string; expiresAt: number } | null = null;

async function igdb(body: string) {
	const clientId = process.env.IGDB_CLIENT_ID!;
	if (!igdbToken || igdbToken.expiresAt < Date.now() + 60_000) {
		const url = new URL("https://id.twitch.tv/oauth2/token");
		url.searchParams.set("client_id", clientId);
		url.searchParams.set("client_secret", process.env.IGDB_CLIENT_SECRET!);
		url.searchParams.set("grant_type", "client_credentials");
		const token = await getJson<any>(url.toString(), { method: "POST" });
		igdbToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
	}
	return getJson<any[]>("https://api.igdb.com/v4/games", {
		method: "POST",
		headers: { "Client-ID": clientId, Authorization: `Bearer ${igdbToken.value}` },
		body,
	});
}

async function searchGames(query: string): Promise<RecordInput[]> {
	const games = await igdb(
		`search ${JSON.stringify(query)}; fields name,first_release_date,url,cover.image_id,involved_companies.developer,involved_companies.company.name; limit 8;`,
	);
	return games.map((g: any) => ({
		kind: "game" as const,
		source: "igdb" as const,
		sourceId: String(g.id),
		title: g.name,
		creators: (g.involved_companies ?? [])
			.filter((c: any) => c.developer)
			.map((c: any) => c.company?.name)
			.filter(Boolean)
			.slice(0, 2),
		year: yearOf(g.first_release_date),
		image: g.cover?.image_id
			? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${g.cover.image_id}.jpg`
			: undefined,
		url: g.url,
	}));
}

// --- Public API ------------------------------------------------------------

function enabledKinds(): Kind[] {
	const kinds: Kind[] = [];
	if (process.env.TMDB_API_KEY) kinds.push("movie", "show");
	kinds.push("book", "album");
	if (process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET) kinds.push("game");
	return kinds;
}

const searchers: Record<Kind, (query: string) => Promise<RecordInput[]>> = {
	movie: searchMovies,
	show: searchShows,
	book: searchBooks,
	album: searchAlbums,
	game: searchGames,
};

export const kinds = query({
	args: {},
	handler: async () => enabledKinds(),
});

export const search = action({
	args: { kind: vKind, query: v.string() },
	handler: async (ctx, { kind, query }): Promise<Doc<"records">[]> => {
		if (!(await ctx.auth.getUserIdentity())) throw new ConvexError("Not signed in");
		const q = query.trim().slice(0, 100);
		if (q.length < 2) return [];
		if (!enabledKinds().includes(kind)) throw new ConvexError(`Search for ${kind}s isn't set up yet.`);

		let found: RecordInput[];
		try {
			found = await searchers[kind](q);
		} catch (error) {
			console.error(`search ${kind} failed`, error);
			throw new ConvexError("Search is having trouble right now. Try again in a moment.");
		}
		if (found.length === 0) return [];
		// Results are cached as records so adding one only needs its id; the
		// client never supplies record data itself.
		return await ctx.runMutation(internal.media.upsert, { records: found });
	},
});

export const upsert = internalMutation({
	args: {
		records: v.array(
			v.object({
				kind: vKind,
				source: vSource,
				sourceId: v.string(),
				title: v.string(),
				subtitle: v.optional(v.string()),
				creators: v.array(v.string()),
				year: v.optional(v.number()),
				image: v.optional(v.string()),
				url: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, { records }) => {
		const out: Doc<"records">[] = [];
		for (const record of records) {
			const existing = await ctx.db
				.query("records")
				.withIndex("by_source", (q) => q.eq("source", record.source).eq("sourceId", record.sourceId))
				.unique();
			if (existing) {
				// Keep previously fetched creators if this pass skipped the detail call.
				const merged = {
					...record,
					creators: record.creators.length ? record.creators : existing.creators,
				};
				await ctx.db.patch(existing._id, merged);
				out.push({ ...existing, ...merged });
			} else {
				const id = await ctx.db.insert("records", record);
				out.push((await ctx.db.get(id))!);
			}
		}
		return out;
	},
});
