import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { vLayout, vVisibility } from "./schema";
import { LIMITS, PEEK } from "./shared/constants";
import { hasArt } from "./shared/images";
import { DEFAULT_THEME, isThemeId, randomSeed, THEMES } from "./shared/themes";
import { requireUserId } from "./users";

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeSlug() {
	let slug = "";
	for (let i = 0; i < 10; i++) {
		slug += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
	}
	return slug;
}

export async function getListBySlug(ctx: QueryCtx, slug: string) {
	return await ctx.db
		.query("lists")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.unique();
}

export async function requireOwnedList(ctx: MutationCtx, listId: Id<"lists">) {
	const userId = await requireUserId(ctx);
	const list = await ctx.db.get(listId);
	if (!list || list.ownerId !== userId) throw new ConvexError("List not found");
	return list;
}

export function canView(list: Doc<"lists">, viewerId: string | null) {
	return list.visibility !== "private" || list.ownerId === viewerId;
}

/** Bumps updatedAt (and item count when given) after any change to a list. */
export async function touchList(
	ctx: MutationCtx,
	listId: Id<"lists">,
	itemDelta = 0,
) {
	const list = await ctx.db.get(listId);
	if (!list) return;
	await ctx.db.patch(listId, {
		updatedAt: Date.now(),
		itemCount: Math.max(0, list.itemCount + itemDelta),
	});
}

export const get = query({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) => {
		const list = await getListBySlug(ctx, slug);
		if (!list) return null;
		const viewerId = await getAuthUserId(ctx);
		if (!canView(list, viewerId)) return null;

		const owner = await ctx.db.get(list.ownerId);
		const rows = await ctx.db
			.query("items")
			.withIndex("by_list", (q) => q.eq("listId", list._id))
			.collect();
		const items = await Promise.all(
			rows.map(async (item) => ({ ...item, record: await ctx.db.get(item.recordId) })),
		);

		return {
			list,
			owner: owner && { username: owner.username },
			isOwner: viewerId === list.ownerId,
			items: items.filter((i) => i.record !== null) as Array<
				Doc<"items"> & { record: Doc<"records"> }
			>,
		};
	},
});

export const recent = query({
	args: {},
	handler: async (ctx) => {
		const lists = await ctx.db
			.query("lists")
			.withIndex("by_visibility", (q) => q.eq("visibility", "public"))
			.order("desc")
			.take(40);
		const withItems = lists.filter((l) => l.itemCount > 0).slice(0, 12);
		return await Promise.all(
			withItems.map(async (list) => {
				const owner = await ctx.db.get(list.ownerId);
				if (owner?.isPrivate) return null;
				const first = await ctx.db
					.query("items")
					.withIndex("by_list", (q) => q.eq("listId", list._id))
					.take(PEEK);
				const records = await Promise.all(first.map((i) => ctx.db.get(i.recordId)));
				return {
					...list,
					owner: owner && { username: owner.username },
					covers: records
						.filter((r) => hasArt(r?.image))
						.map((r) => ({ image: r!.image!, kind: r!.kind, title: r!.title })),
				};
			}),
		).then((rows) => rows.filter((r) => r !== null));
	},
});

export const create = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const existing = await ctx.db
			.query("lists")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.take(LIMITS.listsPerUser);
		if (existing.length >= LIMITS.listsPerUser) {
			throw new ConvexError(`You can have up to ${LIMITS.listsPerUser} lists for now.`);
		}

		let slug = makeSlug();
		while (await getListBySlug(ctx, slug)) slug = makeSlug();

		const date = new Date().toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
		const theme = THEMES[Math.floor(Math.random() * THEMES.length)]?.id ?? DEFAULT_THEME;
		await ctx.db.insert("lists", {
			ownerId: userId,
			slug,
			name: `Untitled list, ${date}`,
			visibility: "public",
			layout: "list",
			ranked: false,
			theme,
			seed: randomSeed(),
			itemCount: 0,
			updatedAt: Date.now(),
		});
		return slug;
	},
});

export const update = mutation({
	args: {
		listId: v.id("lists"),
		name: v.optional(v.string()),
		emoji: v.optional(v.union(v.string(), v.null())),
		description: v.optional(v.string()),
		visibility: v.optional(vVisibility),
		layout: v.optional(vLayout),
		ranked: v.optional(v.boolean()),
		theme: v.optional(v.string()),
		seed: v.optional(v.number()),
	},
	handler: async (ctx, { listId, ...args }) => {
		await requireOwnedList(ctx, listId);
		const patch: Partial<Doc<"lists">> = { updatedAt: Date.now() };

		if (args.name !== undefined) {
			const name = args.name.trim();
			if (!name) throw new ConvexError("Give your list a name.");
			patch.name = name.slice(0, LIMITS.listName);
		}
		if (args.emoji !== undefined) {
			// One grapheme, so a pasted sentence doesn't become the "emoji".
			const emoji = args.emoji?.trim();
			const first = emoji
				? [...new Intl.Segmenter().segment(emoji)][0]?.segment
				: undefined;
			patch.emoji = first || undefined;
		}
		if (args.description !== undefined) {
			patch.description = args.description.trim().slice(0, LIMITS.listDescription) || undefined;
		}
		if (args.theme !== undefined) {
			if (!isThemeId(args.theme)) throw new ConvexError("Unknown theme");
			patch.theme = args.theme;
		}
		if (args.visibility !== undefined) patch.visibility = args.visibility;
		if (args.layout !== undefined) patch.layout = args.layout;
		if (args.ranked !== undefined) patch.ranked = args.ranked;
		if (args.seed !== undefined) patch.seed = Math.floor(args.seed);

		await ctx.db.patch(listId, patch);
	},
});

export const remove = mutation({
	args: { listId: v.id("lists") },
	handler: async (ctx, { listId }) => {
		await requireOwnedList(ctx, listId);
		const items = await ctx.db
			.query("items")
			.withIndex("by_list", (q) => q.eq("listId", listId))
			.collect();
		for (const item of items) await ctx.db.delete(item._id);
		const images = await ctx.db
			.query("ogImages")
			.withIndex("by_list", (q) => q.eq("listId", listId))
			.collect();
		for (const image of images) {
			await ctx.storage.delete(image.storageId);
			await ctx.db.delete(image._id);
		}
		await ctx.db.delete(listId);
	},
});

/** The viewer's lists, for "add to list" pickers; flags ones already holding `recordId`. */
export const mine = query({
	args: { recordId: v.optional(v.id("records")) },
	handler: async (ctx, { recordId }) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return [];
		const lists = await ctx.db
			.query("lists")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId as Id<"users">))
			.order("desc")
			.collect();
		const holding = new Set<string>();
		if (recordId) {
			const items = await ctx.db
				.query("items")
				.withIndex("by_record", (q) => q.eq("recordId", recordId))
				.collect();
			for (const item of items) holding.add(item.listId);
		}
		return lists.map((l) => ({ _id: l._id, slug: l.slug, name: l.name, emoji: l.emoji, has: holding.has(l._id) }));
	},
});
