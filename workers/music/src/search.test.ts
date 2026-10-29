import assert from "node:assert/strict";
import { test } from "node:test";
import { insertSql, toRow } from "../import/rows.ts";
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
