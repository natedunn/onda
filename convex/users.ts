import { getAuthUserId } from "@convex-dev/auth/server";
import { vGithubProfile } from "@convex-dev/auth/methods/github/server";
import { vGoogleProfile } from "@convex-dev/auth/methods/google/server";
import { ConvexError, type Validator, v } from "convex/values";
import { vDiscordProfile } from "./authDiscord";
import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	mutation,
	type MutationCtx,
	query,
	type QueryCtx,
} from "./_generated/server";
import { LIMITS, PEEK, USERNAME_PATTERN } from "./shared/constants";

export async function requireUserId(ctx: QueryCtx | MutationCtx) {
	const userId = await getAuthUserId(ctx);
	if (userId === null) throw new ConvexError("Not signed in");
	return userId as Id<"users">;
}

async function uniqueUsername(ctx: MutationCtx, wanted: string) {
	const base =
		wanted
			.toLowerCase()
			.replace(/[^a-z0-9_-]/g, "")
			.replace(/^[-_]+|[-_]+$/g, "")
			.slice(0, 24) || "user";
	for (let i = 0; i < 50; i++) {
		const candidate = i === 0 ? base : `${base}${i + 1}`;
		const taken = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", candidate))
			.unique();
		if (!taken && candidate.length >= 3) return candidate;
	}
	return `${base}${Math.floor(Math.random() * 1e6)}`;
}

type NewUser = {
	username: string;
	name?: string;
	image?: string;
	email?: string;
	emailVerified: boolean;
};

/**
 * First sign-in with a provider account. One person, one onda user: when the
 * provider vouches for the email and a user already has it, sign them into
 * that user instead of making a second one.
 */
async function createOrLink(ctx: MutationCtx, profile: NewUser) {
	const email = profile.emailVerified ? profile.email?.toLowerCase() : undefined;
	if (email) {
		const existing = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", email))
			.first();
		if (existing) return existing._id;
	}
	return await ctx.db.insert("users", {
		username: await uniqueUsername(ctx, profile.username),
		name: profile.name,
		image: profile.image,
		email,
		isPrivate: false,
	});
}

/** Later sign-ins: keep the avatar fresh. Username and name are the user's to edit. */
async function refreshOnSignIn(ctx: MutationCtx, userId: Id<"users">, image: string | undefined) {
	const user = await ctx.db.get(userId);
	// Tolerate a user row that's gone; the sign-in itself still succeeds.
	if (user && image && user.image !== image) await ctx.db.patch(userId, { image });
}

const providerArgs = <Name extends string, P extends Validator<any, "required", any>>(name: Name, profile: P) =>
	v.object({ name: v.literal(name), accountId: v.string(), profile });

export const createFromGithub = internalMutation({
	args: { provider: providerArgs("github", vGithubProfile) },
	returns: v.id("users"),
	handler: async (ctx, { provider: { profile } }) =>
		await createOrLink(ctx, {
			username: profile.login,
			name: profile.name,
			image: profile.avatarUrl,
			email: profile.email,
			emailVerified: profile.emailVerified,
		}),
});

export const onGithubSignIn = internalMutation({
	args: { provider: providerArgs("github", vGithubProfile), userId: v.id("users") },
	returns: v.null(),
	handler: async (ctx, { provider: { profile }, userId }) => {
		await refreshOnSignIn(ctx, userId, profile.avatarUrl);
		return null;
	},
});

export const createFromGoogle = internalMutation({
	args: { provider: providerArgs("google", vGoogleProfile) },
	returns: v.id("users"),
	handler: async (ctx, { provider: { profile } }) =>
		await createOrLink(ctx, {
			// Google has no handle; start from the email's local part.
			username: profile.email?.split("@")[0] ?? profile.name ?? "user",
			name: profile.name,
			image: profile.picture,
			email: profile.email,
			emailVerified: profile.emailVerified,
		}),
});

export const onGoogleSignIn = internalMutation({
	args: { provider: providerArgs("google", vGoogleProfile), userId: v.id("users") },
	returns: v.null(),
	handler: async (ctx, { provider: { profile }, userId }) => {
		await refreshOnSignIn(ctx, userId, profile.picture);
		return null;
	},
});

export const createFromDiscord = internalMutation({
	args: { provider: providerArgs("discord", vDiscordProfile) },
	returns: v.id("users"),
	handler: async (ctx, { provider: { profile } }) =>
		await createOrLink(ctx, {
			username: profile.username,
			name: profile.name,
			image: profile.avatarUrl,
			email: profile.email,
			emailVerified: profile.emailVerified,
		}),
});

export const onDiscordSignIn = internalMutation({
	args: { provider: providerArgs("discord", vDiscordProfile), userId: v.id("users") },
	returns: v.null(),
	handler: async (ctx, { provider: { profile }, userId }) => {
		await refreshOnSignIn(ctx, userId, profile.avatarUrl);
		return null;
	},
});

export const createFromGuest = internalMutation({
	args: {
		provider: v.object({
			name: v.literal("anonymous"),
			accountId: v.string(),
			profile: v.object({}),
		}),
	},
	returns: v.id("users"),
	handler: async (ctx) => {
		if (process.env.AUTH_DEV_GUEST !== "true") {
			throw new ConvexError("Guest sign-in is disabled");
		}
		return await ctx.db.insert("users", {
			username: await uniqueUsername(ctx, "guest"),
			name: "Guest",
			isPrivate: false,
		});
	},
});

export const guestEnabled = query({
	args: {},
	handler: async () => process.env.AUTH_DEV_GUEST === "true",
});

export const viewer = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return null;
		return await ctx.db.get(userId as Id<"users">);
	},
});

export const profile = query({
	args: { username: v.string() },
	handler: async (ctx, { username }) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", username.toLowerCase()))
			.unique();
		if (!user) return null;
		const viewerId = await getAuthUserId(ctx);
		const isOwner = viewerId === user._id;
		if (user.isPrivate && !isOwner) return { user: null, isPrivate: true as const };

		const lists = await ctx.db
			.query("lists")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id))
			.order("desc")
			.collect();
		const visible = lists.filter((l) => isOwner || l.visibility === "public");

		const counts: Record<string, number> = {};
		let items = 0;
		const withCovers = await Promise.all(
			visible.map(async (list) => {
				const listItems = await ctx.db
					.query("items")
					.withIndex("by_list", (q) => q.eq("listId", list._id))
					.collect();
				const records = await Promise.all(listItems.map((i) => ctx.db.get(i.recordId)));
				for (const r of records) {
					if (!r) continue;
					counts[r.kind] = (counts[r.kind] ?? 0) + 1;
					items++;
				}
				return {
					...list,
					covers: records
						.filter((r) => r?.image)
						.slice(0, PEEK)
						.map((r) => ({ image: r!.image!, kind: r!.kind, title: r!.title })),
				};
			}),
		);

		return {
			user: {
				_id: user._id,
				_creationTime: user._creationTime,
				username: user.username,
				name: user.name,
				image: user.image,
				bio: user.bio,
				isPrivate: user.isPrivate,
			},
			isOwner,
			lists: withCovers,
			stats: { lists: visible.length, items, counts },
		};
	},
});

export const updateProfile = mutation({
	args: {
		username: v.string(),
		name: v.optional(v.string()),
		bio: v.optional(v.string()),
		isPrivate: v.boolean(),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);
		const username = args.username.trim().toLowerCase();
		if (!USERNAME_PATTERN.test(username)) {
			throw new ConvexError(
				"Usernames are 3–30 characters: letters, numbers, dashes and underscores.",
			);
		}
		const existing = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", username))
			.unique();
		if (existing && existing._id !== userId) {
			throw new ConvexError("That username is taken.");
		}
		const bio = args.bio?.trim().slice(0, LIMITS.bio) || undefined;
		const name = args.name?.trim().slice(0, 60) || undefined;
		await ctx.db.patch(userId, { username, name, bio, isPrivate: args.isPrivate });
		return { username };
	},
});
