// Source APIs, one per kind. Search returns lightweight records; details()
// returns the fuller record shown on an item's own page.
import type { Doc } from "./_generated/dataModel";
import type { Kind, Language } from "./shared/constants";
import { isoDay } from "./shared/releases";

export type RecordInput = Omit<Doc<"records">, "_id" | "_creationTime" | "searchText">;

/** Something coming out, for the release calendar. */
export type Release = {
	record: RecordInput;
	/** As exact as the source knows: "2026-11-19", "2027-03", "2027-Q1" or "2027". */
	date: string;
	/** A short note shown with the date: platforms, "Limited". */
	detail?: string;
	/** The source's own measure of anticipation; only compared within a kind. */
	score: number;
	indie: boolean;
};

// `language` asks the source for its titles, art and editions in that language. Providers
// whose sources aren't localized (albums, games) ignore it.
export type Provider = {
	search: (query: string, language?: Language) => Promise<RecordInput[]>;
	/** Asks the source itself, skipping any mirror; for "Not here?" in the add dialog. */
	searchLive?: (query: string) => Promise<RecordInput[]>;
	/** `current` is the cached record, if any. */
	details: (sourceId: string, current?: RecordInput | null, language?: Language) => Promise<RecordInput | null>;
	/** Shape check for ids arriving from URLs. */
	idPattern: RegExp;
	/**
	 * Releases dated from `from` (a day, "2026-10-20") on, for the release calendar.
	 * Records usually come with details, so their pages open without another fetch.
	 * `listed` gets the lowercased creators on someone's list, to keep them past a cut.
	 */
	upcoming?: (from: string, listed: () => Promise<Set<string>>) => Promise<Release[]>;
};

/** How a record stores a language: absent for English. */
export const recordLanguage = (language: Language = "en") => (language === "en" ? undefined : language);

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

const TMDB_LANGUAGES: Record<Language, string> = { en: "en-US", es: "es-MX" };

function tmdb(path: string, params: Record<string, string> = {}, language: Language = "en") {
	const key = process.env.TMDB_API_KEY!;
	const url = new URL(`https://api.themoviedb.org/3${path}`);
	url.searchParams.set("language", TMDB_LANGUAGES[language]);
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
	async search(query, language) {
		const { results = [] } = await tmdb("/search/movie", { query, include_adult: "false" }, language);
		return await Promise.all(
			results.slice(0, 8).map(async (m: any, i: number) => {
				// Directors need a second call; only worth it for the top hits.
				const credits = i < 5 ? await tmdb(`/movie/${m.id}/credits`).catch(() => null) : null;
				return movieRecord(m, directors(credits));
			}),
		);
	},
	details: (id, _current, language) =>
		orNull(async () => movieDetails(await tmdb(`/movie/${id}`, { append_to_response: "credits" }, language))),
	upcoming: upcomingMovies,
};

/** The full record from /movie/{id} with credits appended. */
function movieDetails(m: any): RecordInput {
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
}

// Release types on TMDB: 1 premiere, 2 limited, 3 theatrical, 4 digital, 5 physical, 6 TV.
const MOVIE_RELEASE_TYPES: Record<number, string | undefined> = { 2: "Limited", 3: undefined, 4: "Digital" };
// A movie made by none of these counts as indie. Matched against production company names.
const MAJOR_STUDIOS =
	/\b(walt disney|disney|pixar|marvel studios|lucasfilm|20th century|warner bros|new line|dc studios|universal pictures|illumination|dreamworks|paramount|columbia pictures|sony pictures|tristar|netflix|amazon|mgm|apple|lionsgate|legendary)\b/i;
const MOVIE_PAGES_PER_MONTH = 3;
// Straight-to-digital titles below this are mostly unknown. TMDB popularity climbs as a
// date nears, so one that catches on comes back. Limited and theatrical releases skip this.
const MIN_DIGITAL_POPULARITY = 1;

/**
 * US releases (limited, theatrical or digital) from `from` through the next
 * twelve months: the most popular few pages of each month, then each movie's own
 * US dates, so a re-release or a digital release of an older film is left out.
 */
async function upcomingMovies(from: string): Promise<Release[]> {
	const ids = await discoverByMonth("/discover/movie", "release_date", from, MOVIE_PAGES_PER_MONTH, {
		region: "US",
		with_release_type: "2|3|4",
	});
	return compact(
		await inBatches([...ids], 8, async (id): Promise<Release | null> => {
			const m = await tmdb(`/movie/${id}`, { append_to_response: "credits,release_dates" });
			const us = (m.release_dates?.results ?? []).find((r: any) => r.iso_3166_1 === "US")?.release_dates ?? [];
			const first = us
				.filter((r: any) => r.type in MOVIE_RELEASE_TYPES)
				.map((r: any) => ({ date: String(r.release_date).slice(0, 10), type: r.type as number }))
				.sort((a: any, b: any) => a.date.localeCompare(b.date))[0];
			if (!first || first.date < from) return null;
			if (first.type === 4 && (m.popularity ?? 0) < MIN_DIGITAL_POPULARITY) return null;
			return {
				record: movieDetails(m),
				date: first.date,
				detail: MOVIE_RELEASE_TYPES[first.type],
				score: m.popularity ?? 0,
				indie: !(m.production_companies ?? []).some((c: any) => MAJOR_STUDIOS.test(c.name)),
			};
		}),
	);
}

/** The ids on the most popular `pages` of a TMDB discover, one month at a time from `from`. */
async function discoverByMonth(
	path: string,
	dateField: string,
	from: string,
	pages: number,
	params: Record<string, string> = {},
) {
	const ids = new Set<number>();
	const start = new Date(`${from}T00:00:00Z`);
	for (let i = 0; i <= 12; i++) {
		const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
		const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
		for (let page = 1; page <= pages; page++) {
			const { results = [], total_pages = 0 } = await tmdb(path, {
				...params,
				[`${dateField}.gte`]: i === 0 ? from : isoDay(first.getTime()),
				[`${dateField}.lte`]: isoDay(last.getTime()),
				sort_by: "popularity.desc",
				include_adult: "false",
				page: String(page),
			});
			for (const item of results) ids.add(item.id);
			if (page >= total_pages) break;
		}
	}
	return ids;
}

/** Runs `fn` over `items`, `size` at a time; a failed item is logged and dropped. */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<(R | null)[]> {
	const out: (R | null)[] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(
			...(await Promise.all(
				items.slice(i, i + size).map((item) =>
					fn(item).catch((error) => {
						console.warn("upcoming: skipped one", item, error);
						return null;
					}),
				),
			)),
		);
	}
	return out;
}

const compact = <T>(items: (T | null)[]) => items.filter((x): x is T => x !== null);

const shows: Provider = {
	idPattern: /^\d{1,10}$/,
	async search(query, language) {
		const { results = [] } = await tmdb("/search/tv", { query, include_adult: "false" }, language);
		return await Promise.all(
			results.slice(0, 8).map(async (s: any, i: number) => {
				const detail = i < 5 ? await tmdb(`/tv/${s.id}`, {}, language).catch(() => null) : null;
				return showRecord(s, (detail?.created_by ?? []).map((c: any) => c.name).slice(0, 2));
			}),
		);
	},
	details: (id, _current, language) => orNull(async () => showDetails(await tmdb(`/tv/${id}`, {}, language))),
	upcoming: upcomingShows,
};

/** The full record from /tv/{id}. */
function showDetails(s: any): RecordInput {
	return {
		...showRecord(s, (s.created_by ?? []).map((c: any) => c.name).slice(0, 2)),
		description: clean(s.overview),
		genres: (s.genres ?? []).map((g: any) => g.name),
		facts: [
			s.number_of_seasons ? { label: "Seasons", value: String(s.number_of_seasons) } : null,
			s.first_air_date ? { label: "First aired", value: s.first_air_date } : null,
			s.networks?.length ? { label: "Network", value: s.networks.map((n: any) => n.name).join(", ") } : null,
			s.status ? { label: "Status", value: s.status } : null,
		].filter((f) => f !== null),
		detailsFetchedAt: Date.now(),
	};
}

const SHOW_PREMIERE_PAGES_PER_MONTH = 3;
// "Airing this month" is mostly episodes of running seasons, so it takes more pages
// to reach the season premieres among them.
const SHOW_AIRING_PAGES_PER_MONTH = 5;
// Daily and year-round shows (wrestling, soaps, late night) start a new "season"
// every January; a season this long means there's no real premiere to announce.
const MAX_SEASON_EPISODES = 40;
const SHOW_TYPES_WITHOUT_PREMIERES = ["News", "Talk Show"];
// As with digital movies: popularity climbs as a premiere nears. Returning shows skip this.
const MIN_NEW_SHOW_POPULARITY = 1;

/**
 * New series and new seasons from `from` on: each show's next season by air date,
 * found among this year's premieres and the most popular shows airing each month.
 */
async function upcomingShows(from: string): Promise<Release[]> {
	const [premieres, airing] = await Promise.all([
		discoverByMonth("/discover/tv", "first_air_date", from, SHOW_PREMIERE_PAGES_PER_MONTH),
		discoverByMonth("/discover/tv", "air_date", from, SHOW_AIRING_PAGES_PER_MONTH),
	]);
	return compact(
		await inBatches([...new Set([...premieres, ...airing])], 8, async (id): Promise<Release | null> => {
			const s = await tmdb(`/tv/${id}`);
			if (SHOW_TYPES_WITHOUT_PREMIERES.includes(s.type)) return null;
			// Season 0 is specials.
			const seasons = (s.seasons ?? []).filter((x: any) => x.season_number > 0);
			const next = seasons.find((x: any) => x.air_date && x.air_date >= from);
			if (!next) return null;
			const previous = seasons.find((x: any) => x.season_number === next.season_number - 1);
			if ((previous?.episode_count ?? 0) >= MAX_SEASON_EPISODES) return null;
			if (next.season_number === 1 && (s.popularity ?? 0) < MIN_NEW_SHOW_POPULARITY) return null;
			return {
				record: showDetails(s),
				date: next.air_date,
				detail: next.season_number === 1 ? "New series" : `Season ${next.season_number}`,
				score: s.popularity ?? 0,
				indie: false,
			};
		}),
	);
}

// --- Open Library (books) --------------------------------------------------

// Books show one edition's title and cover so they come out in the app's
// language; a work's own cover is whichever edition Open Library picked (often
// a translation), and its title is often the original-language one.
// Open Library takes ISO 639-1 in `lang` but labels editions with MARC codes.
const OL_LANGUAGES: Record<Language, { lang: string; marc: string }> = {
	en: { lang: "en", marc: "eng" },
	es: { lang: "es", marc: "spa" },
};
const EDITION_FIELDS = "editions,editions.key,editions.title,editions.subtitle,editions.cover_i,editions.language";

const olCover = (id?: number) => (id && id > 0 ? ({ host: "openlibrary", id: String(id) }) as const : undefined);
const olText = (text: any): string | undefined => (typeof text === "string" ? text : text?.value);

/** The edition Open Library chose for a search hit, if it's in our language or unlabeled. */
function bookEdition(b: any, language: Language) {
	const edition = b.editions?.docs?.[0];
	if (!edition?.key) return undefined;
	// Search matches editions on the query's words, so a Spanish query can
	// pick a Chinese edition even with lang=en; keep the work's own data then.
	if (edition.language?.length && !edition.language.includes(OL_LANGUAGES[language].marc)) return undefined;
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
async function defaultEdition(workId: string, language: Language) {
	const url = new URL("https://openlibrary.org/search.json");
	url.searchParams.set("q", `key:/works/${workId}`);
	url.searchParams.set("lang", OL_LANGUAGES[language].lang);
	url.searchParams.set("fields", `key,${EDITION_FIELDS}`);
	const { docs = [] } = await getJson<any>(url.toString());
	return docs[0] ? bookEdition(docs[0], language) : undefined;
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
	async search(query, language = "en") {
		const url = new URL("https://openlibrary.org/search.json");
		url.searchParams.set("q", query);
		url.searchParams.set("lang", OL_LANGUAGES[language].lang);
		url.searchParams.set("limit", "8");
		url.searchParams.set("fields", `key,title,subtitle,author_name,first_publish_year,cover_i,${EDITION_FIELDS}`);
		const { docs = [] } = await getJson<any>(url.toString());
		return docs.map((b: any): RecordInput => {
			const edition = bookEdition(b, language);
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
	details: (id, current, language = "en") =>
		orNull(async () => {
			const work = await olWork(id);
			// Keep the edition the record already shows, so adding a book and
			// then opening it doesn't swap its cover.
			const editionId =
				current?.editionId && /^OL\d+M$/.test(current.editionId)
					? current.editionId
					: (await defaultEdition(String(work.key).replace("/works/", ""), language))?.key.replace("/books/", "");
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

// The highest score of an artist's albums on our mirror (see workers/music). Below this
// they're mostly unknown; artists on someone's list are kept anyway.
const MIN_ALBUM_SCORE = 3;

/** Albums and EPs from the mirror, which MusicBrainz's twice-weekly dumps keep up to date. */
async function upcomingAlbums(from: string, listed: () => Promise<Set<string>>): Promise<Release[]> {
	const url = new URL("/upcoming", process.env.MUSIC_SEARCH_URL);
	url.searchParams.set("from", from);
	const res = await fetch(url, {
		signal: AbortSignal.timeout(15_000),
		headers: { Authorization: `Bearer ${process.env.MUSIC_SEARCH_TOKEN}` },
	});
	if (!res.ok) throw new Error(`music mirror responded ${res.status}`);
	const { albums } = (await res.json()) as {
		albums: { id: string; title: string; artist: string; date: string; type: string; score: number }[];
	};
	const artists = await listed();
	return albums
		.filter((a) => a.score >= MIN_ALBUM_SCORE || artists.has(a.artist.toLowerCase()))
		.map((a) => ({
			record: albumRecord({
				id: a.id,
				title: a.title,
				"primary-type": a.type,
				"artist-credit": [{ name: a.artist }],
				"first-release-date": a.date,
			}),
			date: a.date,
			detail: a.type === "EP" ? "EP" : undefined,
			score: a.score,
			indie: false,
		}));
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
	upcoming: upcomingAlbums,
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
		return g ? gameDetails(g) : null;
	},
	upcoming: upcomingGames,
};

function gameDetails(g: any): RecordInput {
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
}

// IGDB game types worth a calendar: main games, standalone expansions, remakes,
// remasters and expanded editions. DLC, ports and bundles are left out.
const CALENDAR_GAME_TYPES = "(0,4,8,9,10)";
// IGDB's release_dates.date_format: 0 exact day, 1 month, 2 year, 3–6 Q1–Q4, 7 TBD.
// Vague dates are stored on the last day of their span (Q1 2027 → 2027-03-31).
function gameDate(seconds: number, format: number) {
	const day = isoDay(seconds * 1000);
	if (format === 0) return day;
	if (format === 1) return day.slice(0, 7);
	if (format >= 3 && format <= 6) return `${day.slice(0, 4)}-Q${format - 2}`;
	return day.slice(0, 4);
}

// IGDB "hypes": follows before release. One is mostly the developer; at two the
// vague-dated ones are mostly games still being worked on.
const MIN_GAME_HYPES = 2;

/**
 * Hyped games whose first release is from the start of `from`'s month through the
 * end of next year, so games dated only "this month" or "2027" are included.
 */
async function upcomingGames(from: string): Promise<Release[]> {
	const start = Math.floor(Date.parse(`${from.slice(0, 7)}-01T00:00:00Z`) / 1000);
	const end = Math.floor(Date.UTC(Number(from.slice(0, 4)) + 2, 0, 1) / 1000);
	const fields = `${GAME_FIELDS},hypes,release_dates.date,release_dates.date_format,release_dates.platform.abbreviation`;
	const games: any[] = [];
	for (let offset = 0; offset < 2000; offset += 500) {
		const page = await igdb(
			`fields ${fields}; where first_release_date >= ${start} & first_release_date < ${end} & game_type = ${CALENDAR_GAME_TYPES} & hypes >= ${MIN_GAME_HYPES}; sort hypes desc; limit 500; offset ${offset};`,
		);
		games.push(...page);
		if (page.length < 500) break;
	}
	const thisMonth = isoDay(Date.now()).slice(0, 7);
	return compact(
		games.map((g): Release | null => {
			const dates = (g.release_dates ?? []).filter((r: any) => r.date === g.first_release_date);
			const date = gameDate(g.first_release_date, dates[0]?.date_format ?? 0);
			// Days from `from` on (recent releases stay a while); a month only until it's over.
			if (date.length === 10 ? date < from : date.length === 7 && date < thisMonth) return null;
			const platforms = [
				...new Set<string>(
					(g.release_dates ?? [])
						.filter((r: any) => r.date >= g.first_release_date)
						.map((r: any) => r.platform?.abbreviation)
						.filter(Boolean),
				),
			];
			return {
				record: gameDetails(g),
				date,
				detail: platforms.slice(0, 4).join(" · ") || undefined,
				score: g.hypes ?? 0,
				indie: (g.genres ?? []).some((x: any) => x.name === "Indie"),
			};
		}),
	);
}

export const PROVIDERS: Record<Kind, Provider> = { movie: movies, show: shows, book: books, album: albums, game: games };

export function enabledKinds(): Kind[] {
	const kinds: Kind[] = [];
	if (process.env.TMDB_API_KEY) kinds.push("movie", "show");
	kinds.push("book", "album");
	if (process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET) kinds.push("game");
	return kinds;
}
