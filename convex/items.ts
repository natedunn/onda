import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { copyWhenListed } from "./images";
import { requireOwnedList, touchList } from "./lists";
import { LIMITS } from "./shared/constants";

export const add = mutation({
	args: { listId: v.id("lists"), recordId: v.id("records") },
	handler: async (ctx, { listId, recordId }) => {
		const list = await requireOwnedList(ctx, listId);
		if (list.itemCount >= LIMITS.itemsPerList) {
			throw new ConvexError(`Lists hold up to ${LIMITS.itemsPerList} items for now.`);
		}
		const record = await ctx.db.get(recordId);
		if (!record) throw new ConvexError("Unknown item");

		const items = await ctx.db
			.query("items")
			.withIndex("by_list", (q) => q.eq("listId", listId))
			.collect();
		if (items.some((i) => i.recordId === recordId)) {
			throw new ConvexError("That's already on this list.");
		}
		const last = items.at(-1);
		const id = await ctx.db.insert("items", {
			listId,
			recordId,
			position: last ? last.position + 1 : 0,
		});
		await touchList(ctx, listId, 1);
		await copyWhenListed(ctx, record);
		return id;
	},
});

export const remove = mutation({
	args: { itemId: v.id("items") },
	handler: async (ctx, { itemId }) => {
		const item = await ctx.db.get(itemId);
		if (!item) return;
		await requireOwnedList(ctx, item.listId);
		await ctx.db.delete(itemId);
		await touchList(ctx, item.listId, -1);
	},
});

export const setNote = mutation({
	args: { itemId: v.id("items"), note: v.string() },
	handler: async (ctx, { itemId, note }) => {
		const item = await ctx.db.get(itemId);
		if (!item) throw new ConvexError("Item not found");
		await requireOwnedList(ctx, item.listId);
		await ctx.db.patch(itemId, { note: note.trim().slice(0, LIMITS.itemNote) || undefined });
		await touchList(ctx, item.listId);
	},
});

/** Moves an item so it sits at `toIndex` in the list's current order. */
export const move = mutation({
	args: { itemId: v.id("items"), toIndex: v.number() },
	handler: async (ctx, { itemId, toIndex }) => {
		const item = await ctx.db.get(itemId);
		if (!item) throw new ConvexError("Item not found");
		await requireOwnedList(ctx, item.listId);

		const others = (
			await ctx.db
				.query("items")
				.withIndex("by_list", (q) => q.eq("listId", item.listId))
				.collect()
		).filter((i) => i._id !== itemId);
		const index = Math.max(0, Math.min(Math.floor(toIndex), others.length));
		const before = others[index - 1]?.position;
		const after = others[index]?.position;

		let position: number;
		if (before === undefined && after === undefined) position = 0;
		else if (before === undefined) position = after! - 1;
		else if (after === undefined) position = before + 1;
		else position = (before + after) / 2;

		// Floats run out of room after ~50 halvings between the same pair; renumber then.
		if (before !== undefined && after !== undefined && after - before < 1e-9) {
			others.splice(index, 0, item);
			await Promise.all(others.map((row, i) => ctx.db.patch(row._id, { position: i })));
		} else {
			await ctx.db.patch(itemId, { position });
		}
		await touchList(ctx, item.listId);
	},
});
