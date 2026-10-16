import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation, type MutationCtx, query } from "./_generated/server";
import { enabledKinds, PROVIDERS, type RecordInput } from "./providers";
import { recordFields, vKind } from "./schema";

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
			found = await PROVIDERS[kind].search(q);
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

/** Insert or refresh a record, keeping richer data a lighter fetch didn't include. */
export async function upsertRecord(ctx: MutationCtx, record: RecordInput) {
	const existing = await ctx.db
		.query("records")
		.withIndex("by_kind", (q) => q.eq("kind", record.kind).eq("sourceId", record.sourceId))
		.unique();
	if (!existing) {
		const id = await ctx.db.insert("records", record);
		return (await ctx.db.get(id))!;
	}
	const merged = {
		...record,
		creators: record.creators.length ? record.creators : existing.creators,
		image: record.image ?? existing.image,
		year: record.year ?? existing.year,
	};
	await ctx.db.patch(existing._id, merged);
	return { ...existing, ...merged };
}

export const upsert = internalMutation({
	args: { records: v.array(v.object(recordFields)) },
	handler: async (ctx, { records }) => {
		const out: Doc<"records">[] = [];
		for (const record of records) out.push(await upsertRecord(ctx, record));
		return out;
	},
});
