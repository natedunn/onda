import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, type MutationCtx, query } from "./_generated/server";
import { enabledKinds, PROVIDERS, type RecordInput } from "./providers";
import { recordFields, vKind } from "./schema";

// Repeat searches within this window reuse the source's last answer.
const SEARCH_CACHE_TTL = 24 * 60 * 60 * 1000;

const normalize = (query: string) => query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);

export const kinds = query({
	args: {},
	handler: async () => enabledKinds(),
});

/**
 * Records already saved here that match a search. Instant, and still works when the
 * source API is down; the add dialog shows these above the source's results.
 */
export const searchLocal = query({
	args: { kind: vKind, query: v.string() },
	handler: async (ctx, { kind, query }): Promise<Doc<"records">[]> => {
		const q = normalize(query);
		if (q.length < 2) return [];
		return await ctx.db
			.query("records")
			.withSearchIndex("search", (s) => s.search("searchText", q).eq("kind", kind))
			.take(5);
	},
});

export const search = action({
	args: { kind: vKind, query: v.string() },
	handler: async (ctx, { kind, query }): Promise<Doc<"records">[]> => {
		if (!(await ctx.auth.getUserIdentity())) throw new ConvexError("Not signed in");
		const q = normalize(query);
		if (q.length < 2) return [];
		if (!enabledKinds().includes(kind)) throw new ConvexError(`Search for ${kind}s isn't set up yet.`);

		const cached = await ctx.runQuery(internal.media.cached, { kind, query: q });
		if (cached) return cached;

		let found: RecordInput[];
		try {
			found = await PROVIDERS[kind].search(q);
		} catch (error) {
			console.error(`search ${kind} failed`, error);
			throw new ConvexError("Search is having trouble right now. Try again in a moment.");
		}
		// Results are cached as records so adding one only needs its id; the
		// client never supplies record data itself.
		return await ctx.runMutation(internal.media.upsert, { records: found, cacheAs: { kind, query: q } });
	},
});

export const cached = internalQuery({
	args: { kind: vKind, query: v.string() },
	handler: async (ctx, { kind, query }) => {
		const entry = await ctx.db
			.query("searchCache")
			.withIndex("by_query", (q) => q.eq("kind", kind).eq("query", query))
			.unique();
		if (!entry || Date.now() - entry.fetchedAt > SEARCH_CACHE_TTL) return null;
		const records = await Promise.all(entry.recordIds.map((id) => ctx.db.get(id)));
		return records.filter((r) => r !== null);
	},
});

const searchTextOf = (r: Pick<Doc<"records">, "title" | "subtitle" | "creators">) =>
	[r.title, r.subtitle, ...r.creators].filter(Boolean).join(" ");

/** Insert or refresh a record, keeping richer data a lighter fetch didn't include. */
export async function upsertRecord(ctx: MutationCtx, record: RecordInput) {
	const existing = await ctx.db
		.query("records")
		.withIndex("by_kind", (q) => q.eq("kind", record.kind).eq("sourceId", record.sourceId))
		.unique();
	if (!existing) {
		const id = await ctx.db.insert("records", { ...record, searchText: searchTextOf(record) });
		return (await ctx.db.get(id))!;
	}
	const merged = {
		...record,
		creators: record.creators.length ? record.creators : existing.creators,
		image: record.image ?? existing.image,
		year: record.year ?? existing.year,
	};
	const patch = { ...merged, searchText: searchTextOf(merged) };
	await ctx.db.patch(existing._id, patch);
	return { ...existing, ...patch };
}

export const upsert = internalMutation({
	args: {
		records: v.array(v.object(recordFields)),
		cacheAs: v.optional(v.object({ kind: vKind, query: v.string() })),
	},
	handler: async (ctx, { records, cacheAs }) => {
		const out: Doc<"records">[] = [];
		for (const record of records) out.push(await upsertRecord(ctx, record));
		if (cacheAs) {
			const entry = await ctx.db
				.query("searchCache")
				.withIndex("by_query", (q) => q.eq("kind", cacheAs.kind).eq("query", cacheAs.query))
				.unique();
			const value = { ...cacheAs, recordIds: out.map((r) => r._id), fetchedAt: Date.now() };
			if (entry) await ctx.db.replace(entry._id, value);
			else await ctx.db.insert("searchCache", value);
		}
		return out;
	},
});

/** Drops expired search cache entries; run daily from crons.ts. */
export const pruneSearchCache = internalMutation({
	args: {},
	handler: async (ctx) => {
		const stale = await ctx.db
			.query("searchCache")
			.withIndex("by_fetchedAt", (q) => q.lt("fetchedAt", Date.now() - SEARCH_CACHE_TTL))
			.take(500);
		for (const entry of stale) await ctx.db.delete(entry._id);
		if (stale.length === 500) await ctx.scheduler.runAfter(0, internal.media.pruneSearchCache, {});
	},
});

/** One-off: fills searchText on records saved before it existed. `npx convex run media:backfillSearchText` */
export const backfillSearchText = internalMutation({
	args: { cursor: v.optional(v.union(v.string(), v.null())) },
	handler: async (ctx, { cursor }) => {
		const page = await ctx.db.query("records").paginate({ cursor: cursor ?? null, numItems: 200 });
		for (const r of page.page) {
			if (r.searchText === undefined) await ctx.db.patch(r._id, { searchText: searchTextOf(r) });
		}
		if (!page.isDone) await ctx.scheduler.runAfter(0, internal.media.backfillSearchText, { cursor: page.continueCursor });
	},
});
