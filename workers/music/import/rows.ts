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

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

export function insertSql(table: string, rows: Row[]) {
	const values = rows.map(
		(r) => `(${quote(r.title)},${quote(r.artist)},${quote(r.id)},${r.year ?? "NULL"},${quote(r.type)},${r.boost})`,
	);
	return `INSERT INTO ${table} (title, artist, id, year, type, boost) VALUES ${values.join(",")};\n`;
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
