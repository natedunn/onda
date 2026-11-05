import assert from "node:assert/strict";
import { test } from "node:test";
import { artistIds, insertSql, insertUpcomingSql, toRow, toUpcoming, upcomingTable } from "../import/rows.ts";
import worker, { toMatch } from "./index.ts";

test("queries become quoted FTS5 terms, the last one a prefix", () => {
	assert.equal(toMatch("radiohead ok comp"), '"radiohead" "ok" "comp"*');
	assert.equal(toMatch("  Björk  "), '"björk"*');
	assert.equal(toMatch('AC/DC "back" OR NOT*'), '"ac" "dc" "back" "or" "not"*');
	assert.equal(toMatch("a"), null);
	assert.equal(toMatch("!!"), null);
});

test("keeps albums and EPs with a readable artist credit", () => {
	const row = toRow({
		id: "b1392450-e666-3926-a536-22c65f834433",
		title: "OK Computer",
		"primary-type": "Album",
		"first-release-date": "1997-05-21",
		"artist-credit": [
			{ name: "Simon", joinphrase: " & " },
			{ name: "Garfunkel", joinphrase: "" },
		],
		rating: { "votes-count": 7 },
		tags: [{ count: 5 }, { count: 3 }],
		relations: [{}, {}],
	});
	assert.deepEqual(row, {
		id: "b1392450-e666-3926-a536-22c65f834433",
		title: "OK Computer",
		artist: "Simon & Garfunkel",
		year: 1997,
		type: "Album",
		boost: 4.17,
	});
	assert.equal(toRow({ id: "x", title: "Single", "primary-type": "Single" }), null);
	assert.equal(toRow({ id: "x", title: "No date", "primary-type": "EP", "first-release-date": "" })?.year, null);
});

test("escapes quotes in SQL values", () => {
	const sql = insertSql("albums_a", [
		{ id: "1", title: "Don't", artist: "O'Brien", year: null, type: "EP", boost: 0 },
	]);
	assert.equal(sql, "INSERT INTO albums_a (title, artist, id, year, type, boost) VALUES ('Don''t','O''Brien','1',NULL,'EP',0);\n");
});

test("the calendar keeps new albums dated from a day on", () => {
	const group = (date: string, secondary: string[] = []) => ({
		id: "1",
		title: "New",
		"primary-type": "Album",
		"first-release-date": date,
		"secondary-types": secondary,
		"artist-credit": [{ name: "A", joinphrase: "" }],
	});
	const dated = (date: string, secondary?: string[]) => {
		const g = group(date, secondary);
		return toUpcoming(g, toRow(g)!, "2026-11-05")?.date ?? null;
	};
	assert.equal(dated("2026-12-18"), "2026-12-18");
	assert.equal(dated("2026-12"), "2026-12");
	assert.equal(dated("2027"), "2027");
	assert.equal(dated("2026-10-01"), null);
	// A year-only date of this year is mostly something already out.
	assert.equal(dated("2026"), null);
	assert.equal(dated("2026-??"), null);
	assert.equal(dated("2026-12-18", ["Compilation"]), null);
	assert.equal(dated("2026-12-18", ["Soundtrack"]), "2026-12-18");
});

test("placeholder artists don't count as artists", () => {
	const credit = (id: string) => ({ "artist-credit": [{ artist: { id } }] });
	assert.deepEqual(artistIds(credit("real")), ["real"]);
	assert.deepEqual(artistIds(credit("89ad4ac3-39f7-470e-963a-56509c546377")), []);
});

test("escapes quotes in the calendar's SQL", () => {
	assert.equal(upcomingTable("albums_b"), "upcoming_b");
	const sql = insertUpcomingSql("upcoming_a", [{ id: "1", title: "Don't", artist: "A", date: "2027", type: "EP", score: 3 }]);
	assert.equal(sql, "INSERT INTO upcoming_a (id, title, artist, date, type, score) VALUES ('1','Don''t','A','2027','EP',3);\n");
});

test("upcoming needs a day and the token", async () => {
	const env = {
		SEARCH_TOKEN: "secret",
		DB: { prepare: () => ({ first: async () => ({ value: "albums_a" }) }) } as unknown as D1Database,
	};
	const call = (path: string, auth?: string) =>
		worker.fetch(new Request(`https://music.test${path}`, { headers: auth ? { authorization: auth } : {} }), env);
	assert.equal((await call("/upcoming?from=2026-11-05")).status, 401);
	assert.equal((await call("/upcoming?from=nope", "Bearer secret")).status, 400);
});

test("search requires the token", async () => {
	const env = { SEARCH_TOKEN: "secret", DB: {} as D1Database };
	const call = (auth?: string) =>
		worker.fetch(
			new Request("https://music.test/search?q=ok", { headers: auth ? { authorization: auth } : {} }),
			env,
		);
	assert.equal((await call()).status, 401);
	assert.equal((await call("Bearer nope")).status, 401);
});
