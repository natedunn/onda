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
	v.literal("minimal"),
	v.literal("list"),
	v.literal("list-lg"),
	v.literal("grid-sm"),
	v.literal("grid"),
	v.literal("grid-lg"),
);

const pinned = {
	// Set by hand (an editor or agent); source refreshes leave the image alone.
	pinned: v.optional(v.boolean()),
};

export const vSourceImage = v.object({
	host: v.union(v.literal("tmdb"), v.literal("igdb"), v.literal("caa"), v.literal("openlibrary")),
	id: v.string(),
	...pinned,
});

// Pointers, not URLs; convex/shared/images.ts turns them into src/srcset.
export const vImage = v.union(
	vSourceImage,
	v.object({
		host: v.literal("r2"),
		files: v.array(v.object({ path: v.string(), width: v.number(), height: v.number() })),
		from: v.optional(vSourceImage),
		...pinned,
	}),
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
	image: v.optional(vImage),
	url: v.optional(v.string()),
	// Books: the Open Library edition (OL…M) whose title and cover we show.
	editionId: v.optional(v.string()),
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
		// Verified email from a sign-in provider, lowercased; links providers to one user.
		email: v.optional(v.string()),
	})
		.index("by_username", ["username"])
		.index("by_email", ["email"]),

	lists: defineTable({
		ownerId: v.id("users"),
		// Random public id used in URLs (/@:username/l/:slug).
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
	records: defineTable({
		...recordFields,
		// Title, subtitle and creators, for searching what's already saved. Set by upsertRecord.
		searchText: v.optional(v.string()),
	})
		.index("by_kind", ["kind", "sourceId"])
		.searchIndex("search", { searchField: "searchText", filterFields: ["kind"] }),

	// Source API search results by normalized query, so repeat searches skip the API.
	searchCache: defineTable({
		kind: vKind,
		query: v.string(),
		recordIds: v.array(v.id("records")),
		fetchedAt: v.number(),
	})
		.index("by_query", ["kind", "query"])
		.index("by_fetchedAt", ["fetchedAt"]),

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
