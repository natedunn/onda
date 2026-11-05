// Reads release-group JSON lines on stdin and writes SQL for one table slot to
// stdout. See import/run.sh.
//   usage: node import/build.ts <table> < release-group
import {
	artistIds,
	createSql,
	createUpcomingSql,
	insertSql,
	insertUpcomingSql,
	type Row,
	toRow,
	toUpcoming,
	type UpcomingRow,
	upcomingTable,
} from "./rows.ts";

const table = process.argv[2];
if (!table || !/^albums_[ab]$/.test(table)) throw new Error("usage: build.ts albums_a|albums_b");

const out = process.stdout;
const write = (s: string) => (out.write(s) ? undefined : new Promise((r) => out.once("drain", r)));

// The calendar shows recent releases for two weeks; the Worker filters by date again.
const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const rows: Row[] = [];
const upcoming: { row: UpcomingRow; artists: string[] }[] = [];
// Each artist's most notable album, to rank new albums that have no votes of their own.
const notability = new Map<string, number>();
let seen = 0;
for await (const line of lines(process.stdin)) {
	seen++;
	const group = JSON.parse(line);
	const row = toRow(group);
	if (!row) continue;
	rows.push(row);
	const artists = artistIds(group);
	for (const id of artists) notability.set(id, Math.max(notability.get(id) ?? 0, row.boost));
	const next = toUpcoming(group, row, from);
	if (next) upcoming.push({ row: next, artists });
}
// Most notable first: FTS5 returns matches in row order, so the Worker can rank
// just the first few hundred matches of a broad query and still see the albums
// people mean.
rows.sort((a, b) => b.boost - a.boost);

await write(createSql(table));
let batch: Row[] = [];
let size = 0;
for (const row of rows) {
	batch.push(row);
	size += Buffer.byteLength(row.title + row.artist) + 80;
	// Multi-row inserts keep the file and the import quick; D1 caps a statement at 100 KB.
	if (batch.length === 300 || size > 60_000) {
		await write(insertSql(table, batch));
		batch = [];
		size = 0;
	}
}
if (batch.length) await write(insertSql(table, batch));

const calendar = upcomingTable(table);
await write(createUpcomingSql(calendar));
for (let i = 0; i < upcoming.length; i += 300) {
	const scored = upcoming.slice(i, i + 300).map(({ row, artists }) => ({
		...row,
		score: Math.max(row.score, ...artists.map((id) => notability.get(id) ?? 0)),
	}));
	await write(insertUpcomingSql(calendar, scored));
}
console.error(`build: ${rows.length} of ${seen} release groups into ${table}, ${upcoming.length} into ${calendar}`);

/** Splits on "\n" only: readline also breaks on a bare "\r", which dump strings can contain. */
async function* lines(input: NodeJS.ReadableStream) {
	let rest = "";
	input.setEncoding("utf8");
	for await (const chunk of input as AsyncIterable<string>) {
		const parts = (rest + chunk).split("\n");
		rest = parts.pop()!;
		for (const part of parts) if (part) yield part;
	}
	if (rest) yield rest;
}
