import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vKind = v.union(
	v.literal("movie"),
	v.literal("show"),
	v.literal("book"),
	v.literal("album"),
	v.literal("game"),
);

export const vSource = v.union(
	v.literal("tmdb"),
	v.literal("openlibrary"),
	v.literal("musicbrainz"),
	v.literal("igdb"),
);

export const vVisibility = v.union(
	v.literal("public"),
	v.literal("unlisted"),
	v.literal("private"),
);

export const vLayout = v.union(
	v.literal("list"),
	v.literal("compact"),
	v.literal("grid"),
);

export const recordFields = {
	kind: vKind,
	source: vSource,
	// The source's own id; unique per kind (each kind has one source).
	sourceId: v.string(),
	title: v.string(),
	subtitle: v.optional(v.string()),
	creators: v.array(v.string()),
	year: v.optional(v.number()),
	image: v.optional(v.string()),
	url: v.optional(v.string()),
	// Filled in the first time someone opens the item's page.
	description: v.optional(v.string()),
	genres: v.optional(v.array(v.string())),
	facts: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
	detailsFetchedAt: v.optional(v.number()),
};

export default defineSchema({
	// Auth accounts/sessions live in the auth component; this is the app's user.
	users: defineTable({
		username: v.string(),
		name: v.optional(v.string()),
		image: v.optional(v.string()),
		bio: v.optional(v.string()),
		isPrivate: v.boolean(),
	}).index("by_username", ["username"]),

	lists: defineTable({
		ownerId: v.id("users"),
		// Short public id used in URLs (/l/:slug).
		slug: v.string(),
		name: v.string(),
		emoji: v.optional(v.string()),
		description: v.optional(v.string()),
		visibility: vVisibility,
		layout: vLayout,
		ranked: v.boolean(),
		theme: v.string(),
		// Seeds the mesh gradient so "refresh gradient" is a single number.
		seed: v.number(),
		itemCount: v.number(),
		updatedAt: v.number(),
	})
		.index("by_slug", ["slug"])
		.index("by_owner", ["ownerId", "updatedAt"])
		.index("by_visibility", ["visibility", "updatedAt"]),

	// Shared metadata cache, and the backing data for public item pages. Only
	// written from server-side fetches to the source APIs, never from client data.
	records: defineTable(recordFields)
		.index("by_kind", ["kind", "sourceId"]),

	items: defineTable({
		listId: v.id("lists"),
		recordId: v.id("records"),
		// Fractional ordering: insert/move by picking a number between neighbors.
		position: v.number(),
		note: v.optional(v.string()),
	})
		.index("by_list", ["listId", "position"])
		.index("by_record", ["recordId"]),

	ogImages: defineTable({
		listId: v.id("lists"),
		// Changes whenever anything shown in the image changes.
		version: v.string(),
		storageId: v.id("_storage"),
	}).index("by_list", ["listId"]),
});
