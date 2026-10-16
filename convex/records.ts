import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { upsertRecord } from "./media";
import { enabledKinds, PROVIDERS } from "./providers";
import { recordFields, vKind } from "./schema";
import type { Kind } from "./shared/constants";

// Item pages refetch from the source at most this often.
export const DETAILS_TTL = 30 * 24 * 60 * 60 * 1000;

async function findRecord(ctx: QueryCtx, kind: Kind, sourceId: string) {
	return await ctx.db
		.query("records")
		.withIndex("by_kind", (q) => q.eq("kind", kind).eq("sourceId", sourceId))
		.unique();
}

/** Public item page: the cached record plus the public lists it appears on. */
export const page = query({
	args: { kind: vKind, sourceId: v.string() },
	handler: async (ctx, { kind, sourceId }) => {
		const record = await findRecord(ctx, kind, sourceId);
		if (!record) return { record: null, lists: [] };

		const items = await ctx.db
			.query("items")
			.withIndex("by_record", (q) => q.eq("recordId", record._id))
			.take(200);
		const lists = [];
		for (const item of items) {
			const list = await ctx.db.get(item.listId);
			if (!list || list.visibility !== "public") continue;
			const owner = await ctx.db.get(list.ownerId);
			if (!owner || owner.isPrivate) continue;
			lists.push({
				_id: list._id,
				slug: list.slug,
				name: list.name,
				emoji: list.emoji,
				theme: list.theme,
				seed: list.seed,
				itemCount: list.itemCount,
				updatedAt: list.updatedAt,
				owner: owner.username,
				rank: list.ranked
					? (
							await ctx.db
								.query("items")
								.withIndex("by_list", (q) => q.eq("listId", list._id).lt("position", item.position))
								.collect()
						).length + 1
					: null,
			});
			if (lists.length >= 30) break;
		}
		lists.sort((a, b) => b.updatedAt - a.updatedAt);
		return { record, lists };
	},
});

export const needsDetails = internalQuery({
	args: { kind: vKind, sourceId: v.string() },
	handler: async (ctx, { kind, sourceId }) => {
		const record = await findRecord(ctx, kind, sourceId);
		return !record?.detailsFetchedAt || Date.now() - record.detailsFetchedAt > DETAILS_TTL;
	},
});

export const saveDetails = internalMutation({
	args: { record: v.object(recordFields) },
	handler: async (ctx, { record }) => {
		await upsertRecord(ctx, record);
	},
});

/**
 * Fetch and cache an item's full details if they're missing or stale. Called
 * by the item page; cheap no-op when the cache is fresh, so source APIs see at
 * most one request per item per TTL.
 */
export const ensureDetails = action({
	args: { kind: vKind, sourceId: v.string() },
	handler: async (ctx, { kind, sourceId }): Promise<"fresh" | "updated" | "missing"> => {
		const provider = PROVIDERS[kind];
		if (!enabledKinds().includes(kind) || !provider.idPattern.test(sourceId)) return "missing";
		if (!(await ctx.runQuery(internal.records.needsDetails, { kind, sourceId }))) return "fresh";

		let record;
		try {
			record = await provider.details(sourceId);
		} catch (error) {
			console.error(`details ${kind}/${sourceId} failed`, error);
			throw new ConvexError("Couldn't reach the source right now.");
		}
		if (!record) return "missing";
		await ctx.runMutation(internal.records.saveDetails, { record });
		return "updated";
	},
});
