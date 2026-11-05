// Turns MusicBrainz JSON dump lines (one release group each) into rows for the
// search table. Only CC0 core data is kept: no tags, genres or ratings values,
// which are CC BY-NC-SA. Their counts only feed the ranking boost.

export type Row = {
	id: string;
	title: string;
	artist: string;
	year: number | null;
	type: "Album" | "EP";
	/** Added to the text match score, so well-known albums win ties. */
	boost: number;
};

export function toRow(group: any): Row | null {
	const type = group["primary-type"];
	if (type !== "Album" && type !== "EP") return null;
	if (typeof group.id !== "string" || !group.title) return null;
	const artist = (group["artist-credit"] ?? []).map((a: any) => `${a.name}${a.joinphrase ?? ""}`).join("");
	const year = Number(String(group["first-release-date"] ?? "").slice(0, 4));
	// Rough notability: votes, tag votes and links to Wikidata, Discogs and the like.
	const signal =
		(group.rating?.["votes-count"] ?? 0) +
		(group.tags ?? []).reduce((n: number, t: any) => n + (t.count ?? 0), 0) +
		(group.relations ?? []).length;
	return {
		id: group.id,
		title: group.title,
		artist,
		year: Number.isFinite(year) && year > 0 ? year : null,
		type,
		boost: Math.round(Math.log2(1 + signal) * 100) / 100,
	};
}

/** An album or EP with a release date, for the release calendar. */
export type UpcomingRow = {
	id: string;
	title: string;
	artist: string;
	/** "2026-12-18", "2026-12" or "2027", as exact as MusicBrainz has it. */
	date: string;
	type: "Album" | "EP";
	/** The most notable thing any credited artist has made. New albums have little of their own. */
	score: number;
};

// MusicBrainz's placeholders: "Various Artists" and "[unknown]". Not anyone's notability.
const SPECIAL_ARTISTS = new Set(["89ad4ac3-39f7-470e-963a-56509c546377", "125ec42a-7229-4250-afc5-e057484327fe"]);
// Not new albums, or not music. Soundtracks and mixtapes stay.
const NOT_NEW_ALBUMS = new Set(["Audio drama", "Audiobook", "Compilation", "DJ-mix", "Demo", "Interview", "Live", "Remix", "Spokenword"]);

export const artistIds = (group: any): string[] =>
	(group["artist-credit"] ?? []).map((a: any) => a.artist?.id).filter((id: any) => id && !SPECIAL_ARTISTS.has(id));

/** The calendar's row for a release group dated `from` or later, before it has a score. */
export function toUpcoming(group: any, row: Row, from: string): UpcomingRow | null {
	const date = String(group["first-release-date"] ?? "");
	// Dates compare as strings, so a year-only date of this year drops out: most are already out.
	if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(date) || date < from) return null;
	if ((group["secondary-types"] ?? []).some((t: string) => NOT_NEW_ALBUMS.has(t))) return null;
	return { id: row.id, title: row.title, artist: row.artist, date, type: row.type, score: row.boost };
}

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

export function insertSql(table: string, rows: Row[]) {
	const values = rows.map(
		(r) => `(${quote(r.title)},${quote(r.artist)},${quote(r.id)},${r.year ?? "NULL"},${quote(r.type)},${r.boost})`,
	);
	return `INSERT INTO ${table} (title, artist, id, year, type, boost) VALUES ${values.join(",")};\n`;
}

/** The calendar table that goes with a slot: albums_a → upcoming_a. */
export const upcomingTable = (table: string) => table.replace("albums", "upcoming");

export function insertUpcomingSql(table: string, rows: UpcomingRow[]) {
	const values = rows.map(
		(r) => `(${quote(r.id)},${quote(r.title)},${quote(r.artist)},${quote(r.date)},${quote(r.type)},${r.score})`,
	);
	return `INSERT INTO ${table} (id, title, artist, date, type, score) VALUES ${values.join(",")};\n`;
}

export function createUpcomingSql(table: string) {
	return [
		`DROP TABLE IF EXISTS ${table};`,
		`CREATE TABLE ${table} (id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL, date TEXT NOT NULL, type TEXT NOT NULL, score REAL NOT NULL);`,
		"",
	].join("\n");
}

export function createSql(table: string) {
	return [
		`DROP TABLE IF EXISTS ${table};`,
		// Only title and artist are searched; diacritics fold so "Bjork" finds "Björk".
		`CREATE VIRTUAL TABLE ${table} USING fts5(title, artist, id UNINDEXED, year UNINDEXED, type UNINDEXED, boost UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');`,
		// Title matches count double.
		`INSERT INTO ${table} (${table}, rank) VALUES ('rank', 'bm25(2.0, 1.0)');`,
		"",
	].join("\n");
}
