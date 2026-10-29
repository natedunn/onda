// Reads release-group JSON lines on stdin and writes SQL for one table slot to
// stdout. See import/run.sh.
//   usage: node import/build.ts <table> < release-group
import { createSql, insertSql, type Row, toRow } from "./rows.ts";

const table = process.argv[2];
if (!table || !/^albums_[ab]$/.test(table)) throw new Error("usage: build.ts albums_a|albums_b");

const out = process.stdout;
const write = (s: string) => (out.write(s) ? undefined : new Promise((r) => out.once("drain", r)));

const rows: Row[] = [];
let seen = 0;
for await (const line of lines(process.stdin)) {
	seen++;
	const row = toRow(JSON.parse(line));
	if (row) rows.push(row);
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
console.error(`build: ${rows.length} of ${seen} release groups into ${table}`);

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
