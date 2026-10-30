// Source APIs, one per kind. Search returns lightweight records; details()
// returns the fuller record shown on an item's own page.
import type { Doc } from "./_generated/dataModel";
import type { Kind } from "./shared/constants";

export type RecordInput = Omit<Doc<"records">, "_id" | "_creationTime" | "searchText">;
export type Provider = {
	search: (query: string) => Promise<RecordInput[]>;
	/** Asks the source itself, skipping any mirror; for "Not here?" in the add dialog. */
	searchLive?: (query: string) => Promise<RecordInput[]>;
	/** `current` is the cached record, if any. */
	details: (sourceId: string, current?: RecordInput | null) => Promise<RecordInput | null>;
	/** Shape check for ids arriving from URLs. */
	idPattern: RegExp;
};

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

class NotFound extends Error {}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
	// Free APIs go down; fail fast rather than holding the action open. The
	// deadline covers retries too.
	const signal = AbortSignal.timeout(8000);
	const request = () =>
		fetch(url, {
			signal,
			...init,
			headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init?.headers },
		});
	let res = await request();
	// MusicBrainz sheds load with 503s that usually clear on the next try.
	for (let attempt = 1; res.status === 503 && !init?.method && attempt < 4; attempt++) {
		const wait = Math.min(Number(res.headers.get("retry-after")) || 0, 2) * 1000 + 300 * attempt;
		await res.body?.cancel();
		await new Promise((resolve) => setTimeout(resolve, wait));
		res = await request();
	}
	if (res.status === 404) throw new NotFound();
	if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
	return (await res.json()) as T;
}

/** Runs a details fetch, mapping a 404 from the source to null. */
async function orNull<T>(fn: () => Promise<T>): Promise<T | null> {
	try {
		return await fn();
	} catch (error) {
		if (error instanceof NotFound) return null;
		throw error;
	}
}

const clean = (text?: string | null) => text?.replace(/\r\n/g, "\n").trim() || undefined;

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

const poster = (path?: string | null) => (path ? ({ host: "tmdb", id: path }) as const : undefined);

function movieRecord(m: any, creators: string[]): RecordInput {
	return {
		kind: "movie",
		source: "tmdb",
		sourceId: String(m.id),
		title: m.title,
		creators,
		year: yearOf(m.release_date),
		image: poster(m.poster_path),
		url: `https://www.themoviedb.org/movie/${m.id}`,
	};
}

function showRecord(s: any, creators: string[]): RecordInput {
	return {
		kind: "show",
		source: "tmdb",
		sourceId: String(s.id),
		title: s.name,
		creators,
		year: yearOf(s.first_air_date),
		image: poster(s.poster_path),
		url: `https://www.themoviedb.org/tv/${s.id}`,
	};
}

const directors = (credits: any) =>
	(credits?.crew ?? [])
		.filter((c: any) => c.job === "Director")
		.map((c: any) => c.name)
		.slice(0, 2);

const movies: Provider = {
	idPattern: /^\d{1,10}$/,
	async search(query) {
		const { results = [] } = await tmdb("/search/movie", { query, include_adult: "false" });
		return await Promise.all(
			results.slice(0, 8).map(async (m: any, i: number) => {
				// Directors need a second call; only worth it for the top hits.
				const credits = i < 5 ? await tmdb(`/movie/${m.id}/credits`).catch(() => null) : null;
				return movieRecord(m, directors(credits));
			}),
		);
	},
	details: (id) =>
		orNull(async () => {
			const m = await tmdb(`/movie/${id}`, { append_to_response: "credits" });
			return {
				...movieRecord(m, directors(m.credits)),
				description: clean(m.overview),
				genres: (m.genres ?? []).map((g: any) => g.name),
				facts: [
					m.runtime ? { label: "Runtime", value: `${m.runtime} min` } : null,
					m.release_date ? { label: "Released", value: m.release_date } : null,
					m.credits?.cast?.length
						? {
								label: "Starring",
								value: m.credits.cast
									.slice(0, 4)
									.map((c: any) => c.name)
									.join(", "),
							}
						: null,
				].filter((f) => f !== null),
				detailsFetchedAt: Date.now(),
			};
		}),
};

const shows: Provider = {
	idPattern: /^\d{1,10}$/,
	async search(query) {
		const { results = [] } = await tmdb("/search/tv", { query, include_adult: "false" });
		return await Promise.all(
			results.slice(0, 8).map(async (s: any, i: number) => {
				const detail = i < 5 ? await tmdb(`/tv/${s.id}`).catch(() => null) : null;
				return showRecord(s, (detail?.created_by ?? []).map((c: any) => c.name).slice(0, 2));
			}),
		);
	},
	details: (id) =>
		orNull(async () => {
			const s = await tmdb(`/tv/${id}`);
			return {
				...showRecord(s, (s.created_by ?? []).map((c: any) => c.name).slice(0, 2)),
				description: clean(s.overview),
				genres: (s.genres ?? []).map((g: any) => g.name),
				facts: [
					s.number_of_seasons
						? { label: "Seasons", value: String(s.number_of_seasons) }
						: null,
					s.first_air_date ? { label: "First aired", value: s.first_air_date } : null,
					s.networks?.length
						? { label: "Network", value: s.networks.map((n: any) => n.name).join(", ") }
						: null,
					s.status ? { label: "Status", value: s.status } : null,
				].filter((f) => f !== null),
				detailsFetchedAt: Date.now(),
			};
		}),
};

// --- Open Library (books) --------------------------------------------------

// Books show one edition's title and cover so they come out in the app's
// language; a work's own cover is whichever edition Open Library picked (often
// a translation), and its title is often the original-language one.
const BOOK_LANG = "en";
const EDITION_FIELDS = "editions,editions.key,editions.title,editions.subtitle,editions.cover_i,editions.language";

const olCover = (id?: number) => (id && id > 0 ? ({ host: "openlibrary", id: String(id) }) as const : undefined);
const olText = (text: any): string | undefined => (typeof text === "string" ? text : text?.value);

/** The edition Open Library chose for a search hit, if it's in our language or unlabeled. */
function bookEdition(b: any) {
	const edition = b.editions?.docs?.[0];
	if (!edition?.key) return undefined;
	// Search matches editions on the query's words, so a Spanish query can
	// pick a Chinese edition even with lang=en; keep the work's own data then.
	if (edition.language?.length && !edition.language.includes("eng")) return undefined;
	return edition;
}

const titleKey = (title: string) =>
	title
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/^(the|a|an)\s+/, "")
		// Any script's letters, so "春の庭" isn't empty (a prefix of every title).
		.replace(/[^\p{L}\p{N}]/gu, "");

/**
 * The edition's title when it's a different title (a translation), else the
 * work's: edition titles are typed per printing, so the same title often comes
 * with a series note, caps or a dropped "The" ("A HOUSE DIVIDED").
 */
function bookTitle(work: { title: string; subtitle?: string }, edition?: { title?: string; subtitle?: string } | null) {
	const variant = !edition?.title || titleKey(edition.title).startsWith(titleKey(work.title));
	const { title, subtitle } = variant ? work : { title: edition.title!, subtitle: edition.subtitle };
	// MARC imports end titles with catalogue punctuation ("Baño de damas.--", "Title /").
	const trim = (s?: string) => s?.replace(/[\s.:;,/-]+$/, "") || undefined;
	return { title: trim(title) ?? title, subtitle: trim(subtitle) };
}

/** Our-language edition of a work, independent of any query. */
async function defaultEdition(workId: string) {
	const url = new URL("https://openlibrary.org/search.json");
	url.searchParams.set("q", `key:/works/${workId}`);
	url.searchParams.set("lang", BOOK_LANG);
	url.searchParams.set("fields", `key,${EDITION_FIELDS}`);
	const { docs = [] } = await getJson<any>(url.toString());
	return docs[0] ? bookEdition(docs[0]) : undefined;
}

/** A work, following the redirect Open Library leaves behind when it merges duplicates. */
async function olWork(id: string) {
	let work = await getJson<any>(`https://openlibrary.org/works/${id}.json`);
	for (let hop = 0; work.type?.key === "/type/redirect" && work.location && hop < 3; hop++) {
		work = await getJson<any>(`https://openlibrary.org${work.location}.json`);
	}
	if (!work.title) throw new NotFound();
	return work;
}

const books: Provider = {
	idPattern: /^OL\d+W$/,
	async search(query) {
		const url = new URL("https://openlibrary.org/search.json");
		url.searchParams.set("q", query);
		url.searchParams.set("lang", BOOK_LANG);
		url.searchParams.set("limit", "8");
		url.searchParams.set("fields", `key,title,subtitle,author_name,first_publish_year,cover_i,${EDITION_FIELDS}`);
		const { docs = [] } = await getJson<any>(url.toString());
		return docs.map((b: any): RecordInput => {
			const edition = bookEdition(b);
			return {
				kind: "book",
				source: "openlibrary",
				sourceId: String(b.key).replace("/works/", ""),
				...bookTitle(b, edition),
				creators: (b.author_name ?? []).slice(0, 3),
				year: yearOf(b.first_publish_year),
				image: olCover(edition?.cover_i) ?? olCover(b.cover_i),
				url: `https://openlibrary.org${b.key}`,
				editionId: edition?.key.replace("/books/", ""),
			};
		});
	},
	details: (id, current) =>
		orNull(async () => {
			const work = await olWork(id);
			// Keep the edition the record already shows, so adding a book and
			// then opening it doesn't swap its cover.
			const editionId =
				current?.editionId && /^OL\d+M$/.test(current.editionId)
					? current.editionId
					: (await defaultEdition(String(work.key).replace("/works/", "")))?.key.replace("/books/", "");
			const edition = editionId
				? await orNull(() => getJson<any>(`https://openlibrary.org/books/${editionId}.json`))
				: null;
			const authors = await Promise.all(
				(work.authors ?? []).slice(0, 3).map(async (a: any) => {
					const author = await getJson<any>(`https://openlibrary.org${a.author.key}.json`).catch(() => null);
					return author?.name as string | undefined;
				}),
			);
			const description = olText(work.description) ?? olText(edition?.description);
			const publisher = edition?.publishers?.[0];
			const isbn = edition?.isbn_13?.[0] ?? edition?.isbn_10?.[0];
			return {
				kind: "book",
				source: "openlibrary",
				sourceId: id,
				...bookTitle(work, edition),
				creators: authors.filter((a): a is string => Boolean(a)),
				year: yearOf(work.first_publish_date),
				image: olCover(edition?.covers?.find((c: number) => c > 0)) ?? olCover(work.covers?.find((c: number) => c > 0)),
				url: `https://openlibrary.org/works/${id}`,
				editionId: edition ? editionId : undefined,
				// Open Library descriptions often carry a trailing source/link block.
				description: clean(description?.split(/\n-{3,}/)[0]),
				genres: (work.subjects ?? []).slice(0, 6),
				facts: [
					work.first_publish_date ? { label: "First published", value: work.first_publish_date } : null,
					publisher
						? { label: "Edition", value: [publisher, edition.publish_date].filter(Boolean).join(", ") }
						: null,
					isbn ? { label: "ISBN", value: isbn } : null,
				].filter((f) => f !== null),
				detailsFetchedAt: Date.now(),
			};
		}),
};

// --- MusicBrainz + Cover Art Archive (albums) ------------------------------

const artistCredit = (credit: any[] = []) => credit.map((a) => `${a.name}${a.joinphrase ?? ""}`).join("");

function albumRecord(g: any): RecordInput {
	return {
		kind: "album",
		source: "musicbrainz",
		sourceId: g.id,
		title: g.title,
		subtitle: g["primary-type"] === "EP" ? "EP" : undefined,
		creators: [artistCredit(g["artist-credit"])].filter(Boolean),
		year: yearOf(g["first-release-date"]),
		image: { host: "caa", id: g.id },
		url: `https://musicbrainz.org/release-group/${g.id}`,
	};
}

/**
 * Our MusicBrainz mirror (workers/music), which has no rate limits. Null
 * when it isn't configured or can't answer, so search falls back to the API.
 */
async function searchMirror(query: string): Promise<RecordInput[] | null> {
	const base = process.env.MUSIC_SEARCH_URL;
	if (!base) return null;
	const url = new URL("/search", base);
	url.searchParams.set("q", query);
	url.searchParams.set("limit", "8");
	try {
		const res = await fetch(url, {
			signal: AbortSignal.timeout(3000),
			headers: { Authorization: `Bearer ${process.env.MUSIC_SEARCH_TOKEN}` },
		});
		if (!res.ok) throw new Error(`music mirror responded ${res.status}`);
		const { albums } = (await res.json()) as {
			albums: { id: string; title: string; artist: string; year: number | null; type: string }[];
		};
		return albums.map((a) =>
			albumRecord({
				id: a.id,
				title: a.title,
				"primary-type": a.type,
				"artist-credit": [{ name: a.artist }],
				"first-release-date": a.year ? String(a.year) : undefined,
			}),
		);
	} catch (error) {
		console.warn("music mirror failed, using the MusicBrainz API", error);
		return null;
	}
}

async function searchMusicBrainz(query: string): Promise<RecordInput[]> {
	const url = new URL("https://musicbrainz.org/ws/2/release-group/");
	url.searchParams.set("query", query);
	url.searchParams.set("dismax", "true");
	url.searchParams.set("limit", "15");
	url.searchParams.set("fmt", "json");
	const { "release-groups": groups = [] } = await getJson<any>(url.toString());
	return groups
		.filter((g: any) => ["Album", "EP"].includes(g["primary-type"]))
		.slice(0, 8)
		.map(albumRecord);
}

const albums: Provider = {
	idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
	async search(query) {
		const mirrored = await searchMirror(query);
		// An empty mirror answer may just be a release newer than the dump.
		if (mirrored?.length) return mirrored;
		return await searchMusicBrainz(query);
	},
	// The mirror is up to a few days behind; this finds this week's releases.
	searchLive: searchMusicBrainz,
	details: (id) =>
		orNull(async () => {
			const g = await getJson<any>(
				`https://musicbrainz.org/ws/2/release-group/${id}?inc=artist-credits+genres+releases&fmt=json`,
			);
			return {
				...albumRecord(g),
				genres: (g.genres ?? [])
					.sort((a: any, b: any) => b.count - a.count)
					.slice(0, 6)
					.map((x: any) => x.name),
				facts: [
					g["primary-type"] ? { label: "Type", value: g["primary-type"] } : null,
					g["first-release-date"] ? { label: "Released", value: g["first-release-date"] } : null,
					g.releases?.length ? { label: "Editions", value: String(g.releases.length) } : null,
				].filter((f) => f !== null),
				detailsFetchedAt: Date.now(),
			};
		}),
};

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

const GAME_FIELDS =
	"name,first_release_date,url,summary,cover.image_id,genres.name,platforms.abbreviation,involved_companies.developer,involved_companies.company.name";

function gameRecord(g: any): RecordInput {
	return {
		kind: "game",
		source: "igdb",
		sourceId: String(g.id),
		title: g.name,
		creators: (g.involved_companies ?? [])
			.filter((c: any) => c.developer)
			.map((c: any) => c.company?.name)
			.filter(Boolean)
			.slice(0, 2),
		year: yearOf(g.first_release_date),
		image: g.cover?.image_id ? { host: "igdb", id: g.cover.image_id } : undefined,
		url: g.url,
	};
}

const games: Provider = {
	idPattern: /^\d{1,10}$/,
	async search(query) {
		const results = await igdb(`search ${JSON.stringify(query)}; fields ${GAME_FIELDS}; limit 8;`);
		return results.map(gameRecord);
	},
	async details(id) {
		const [g] = await igdb(`fields ${GAME_FIELDS}; where id = ${Number(id)};`);
		if (!g) return null;
		return {
			...gameRecord(g),
			description: clean(g.summary),
			genres: (g.genres ?? []).map((x: any) => x.name),
			facts: [
				g.platforms?.length
					? { label: "Platforms", value: g.platforms.map((p: any) => p.abbreviation).filter(Boolean).join(", ") }
					: null,
			].filter((f) => f !== null),
			detailsFetchedAt: Date.now(),
		};
	},
};

export const PROVIDERS: Record<Kind, Provider> = { movie: movies, show: shows, book: books, album: albums, game: games };

export function enabledKinds(): Kind[] {
	const kinds: Kind[] = [];
	if (process.env.TMDB_API_KEY) kinds.push("movie", "show");
	kinds.push("book", "album");
	if (process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET) kinds.push("game");
	return kinds;
}
