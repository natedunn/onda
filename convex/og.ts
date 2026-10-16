import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { getListBySlug } from "./lists";

// Bump to invalidate every cached image after changing the design.
const DESIGN_VERSION = 2;

export const listForImage = internalQuery({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) => {
		const list = await getListBySlug(ctx, slug);
		if (!list || list.visibility === "private") return null;
		const owner = await ctx.db.get(list.ownerId);
		const items = await ctx.db
			.query("items")
			.withIndex("by_list", (q) => q.eq("listId", list._id))
			.take(12);
		const records = await Promise.all(items.map((i) => ctx.db.get(i.recordId)));
		return {
			listId: list._id,
			version: `${DESIGN_VERSION}:${list.updatedAt}`,
			name: list.name,
			emoji: list.emoji,
			description: list.description,
			ranked: list.ranked,
			theme: list.theme,
			seed: list.seed,
			itemCount: list.itemCount,
			owner: owner?.username,
			covers: records
				.filter((r) => r?.image)
				.slice(0, 5)
				.map((r) => ({ image: r!.image!, kind: r!.kind })),
		};
	},
});

export const cached = internalQuery({
	args: { listId: v.id("lists"), version: v.string() },
	handler: async (ctx, { listId, version }) => {
		const rows = await ctx.db
			.query("ogImages")
			.withIndex("by_list", (q) => q.eq("listId", listId))
			.collect();
		const hit = rows.find((r) => r.version === version);
		return hit ? await ctx.storage.getUrl(hit.storageId) : null;
	},
});

export const save = internalMutation({
	args: { listId: v.id("lists"), version: v.string(), storageId: v.id("_storage") },
	handler: async (ctx, { listId, version, storageId }) => {
		const old = await ctx.db
			.query("ogImages")
			.withIndex("by_list", (q) => q.eq("listId", listId))
			.collect();
		for (const row of old) {
			await ctx.storage.delete(row.storageId);
			await ctx.db.delete(row._id);
		}
		await ctx.db.insert("ogImages", { listId, version, storageId });
		return await ctx.storage.getUrl(storageId);
	},
});
