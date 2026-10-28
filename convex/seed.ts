// Local dev seed data: `pnpm seed` (or `pnpm seed '{"owner":"someone","email":"..."}'`).
// Looks up real records through the providers, then gives the owner and a few
// test users lists with a spread of visibility, layout, theme and length. The
// owner is created with their email if missing, so signing in links to them.
// Re-running replaces the earlier seed: lists with a `seed-` slug and users
// with a @seed.onda.test email. Refuses to run unless SITE_URL is local.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";
import { enabledKinds, PROVIDERS, type RecordInput } from "./providers";
import { vLayout, vVisibility } from "./schema";
import type { Kind, Layout, Visibility } from "./shared/constants";
import { randomSeed, type ThemeId } from "./shared/themes";

type SeedPick = { kind: Kind; title: string; by?: string; year?: number; note?: string };

const movie = (title: string, year: number, note?: string): SeedPick => ({ kind: "movie", title, year, note });
const show = (title: string, year: number, note?: string): SeedPick => ({ kind: "show", title, year, note });
const book = (title: string, by: string, note?: string): SeedPick => ({ kind: "book", title, by, note });
const album = (title: string, by: string, note?: string): SeedPick => ({ kind: "album", title, by, note });
const game = (title: string, year: number, note?: string): SeedPick => ({ kind: "game", title, year, note });

type SeedList = {
	slug: string;
	name: string;
	emoji?: string;
	description?: string;
	visibility: Visibility;
	layout: Layout;
	ranked: boolean;
	theme: ThemeId;
	items: SeedPick[];
};

type SeedUser = {
	username: string;
	name?: string;
	bio?: string;
	isPrivate: boolean;
	lists: SeedList[];
};

const OWNER_LISTS: SeedList[] = [
	{
		slug: "seed-desert-island",
		name: "Films I'd take to a desert island",
		emoji: "🏝️",
		description: "Assuming the island has a projector. Ranked, and I will defend the order.",
		visibility: "public",
		layout: "grid",
		ranked: true,
		theme: "dusk",
		items: [
			movie("Paris, Texas", 1984, "The phone booth scene. That's the note."),
			movie("In the Mood for Love", 2000),
			movie("Spirited Away", 2001, "Rewatched every winter since I was twelve."),
			movie("Stalker", 1979),
			movie("Mad Max: Fury Road", 2015),
			movie("Portrait of a Lady on Fire", 2019, "Turn to the page."),
			movie("Yi Yi", 2000),
			movie("The Thing", 1982),
			movie("Before Sunset", 2004),
			movie("Parasite", 2019),
			movie("Spider-Man: Into the Spider-Verse", 2018),
			movie("Aftersun", 2022, "Do not watch this on a plane."),
		],
	},
	{
		slug: "seed-comfort-tv",
		name: "Comfort TV",
		emoji: "🛋️",
		description: "For sick days and Sunday nights.",
		visibility: "public",
		layout: "list",
		ranked: false,
		theme: "cake",
		items: [
			show("Parks and Recreation", 2009, "Skip season one. Everyone says it because it's true."),
			show("Great British Bake Off", 2010),
			show("Detectorists", 2014),
			show("Bob's Burgers", 2011),
			show("Gilmore Girls", 2000, "Team Jess, obviously."),
			show("Taskmaster", 2015),
			show("Schitt's Creek", 2015),
			show("The Good Place", 2016),
		],
	},
	{
		slug: "seed-reading-2026",
		name: "Reading in 2026",
		emoji: "📚",
		visibility: "public",
		layout: "compact",
		ranked: false,
		theme: "sand",
		items: [
			book("Piranesi", "Susanna Clarke"),
			book("The Left Hand of Darkness", "Ursula K. Le Guin"),
			book("Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin"),
			book("Klara and the Sun", "Kazuo Ishiguro"),
			book("The Overstory", "Richard Powers", "Slow start, then it grows roots in you."),
			book("Project Hail Mary", "Andy Weir"),
			book("A Psalm for the Wild-Built", "Becky Chambers"),
			book("Pachinko", "Min Jin Lee"),
			book("The Remains of the Day", "Kazuo Ishiguro"),
			book("Station Eleven", "Emily St. John Mandel"),
		],
	},
	{
		slug: "seed-rewired",
		name: "Records that rewired my brain",
		description:
			"Not the best albums ever made, just the ones that changed what I thought music could do. " +
			"Most of these I heard first on a burned CD from a friend with better taste than me, " +
			"in a car with one working speaker. Some of them I didn't like for a year. All of them I " +
			"still play start to finish, no shuffle, which is the highest compliment I know how to pay.",
		visibility: "public",
		layout: "grid-lg",
		ranked: true,
		theme: "after-hours",
		items: [
			album("In Rainbows", "Radiohead", "Pay-what-you-want and I paid nothing. I owe them."),
			album("Blonde", "Frank Ocean"),
			album("Kid A", "Radiohead"),
			album("To Pimp a Butterfly", "Kendrick Lamar"),
			album("Vespertine", "Björk"),
			album("Carrie & Lowell", "Sufjan Stevens"),
			album("Since I Left You", "The Avalanches"),
			album("Madvillainy", "Madvillain"),
			album("Ágætis byrjun", "Sigur Rós"),
		],
	},
	{
		slug: "seed-autumn",
		name: "Everything good about autumn",
		emoji: "🍂",
		description: "A mixed bag for when it gets dark at five.",
		visibility: "unlisted",
		layout: "list",
		ranked: false,
		theme: "forest",
		items: [
			movie("Fantastic Mr. Fox", 2009),
			book("The Secret History", "Donna Tartt", "Required reading the week the leaves turn."),
			album("For Emma, Forever Ago", "Bon Iver"),
			game("Night in the Woods", 2017),
			show("Over the Garden Wall", 2014, "Ten episodes. Watch them all in one night."),
			movie("Dead Poets Society", 1989),
			game("Firewatch", 2016),
		],
	},
	{
		slug: "seed-backlog",
		name: "Game backlog (be honest)",
		emoji: "🎮",
		description: "Bought in sales, never started. Private so nobody can judge me.",
		visibility: "private",
		layout: "grid-sm",
		ranked: false,
		theme: "punk",
		items: [
			game("Disco Elysium", 2019),
			game("Outer Wilds", 2019, "Started twice. Got scared of the anglerfish twice."),
			game("Hollow Knight", 2017),
			game("Elden Ring", 2022),
			game("Return of the Obra Dinn", 2018),
			game("Hades", 2020),
			game("Celeste", 2018),
			game("Baldur's Gate 3", 2023),
			game("Tunic", 2022),
			game("Pentiment", 2022),
			game("Inscryption", 2021),
			game("Sekiro: Shadows Die Twice", 2019),
			game("Death Stranding", 2019),
			game("Animal Well", 2024),
		],
	},
	{
		slug: "seed-one",
		name: "The perfect movie",
		visibility: "public",
		layout: "list",
		ranked: false,
		theme: "paper",
		items: [movie("Jaws", 1975)],
	},
	{
		slug: "seed-empty",
		name: "Untitled list, Oct 28, 2026",
		visibility: "public",
		layout: "list",
		ranked: false,
		theme: "blood-orange",
		items: [],
	},
	{
		slug: "seed-parties",
		name: "Every movie, show, book, album and game I keep recommending to people at parties, in order",
		description: "Long list, long name. A stress test that's also true.",
		visibility: "private",
		layout: "grid-sm",
		ranked: true,
		theme: "verano",
		items: [
			show("Severance", 2022),
			movie("Paris, Texas", 1984),
			book("Piranesi", "Susanna Clarke"),
			game("Outer Wilds", 2019),
			album("In Rainbows", "Radiohead"),
			show("Atlanta", 2016),
			movie("Spirited Away", 2001),
			book("Project Hail Mary", "Andy Weir"),
			game("Disco Elysium", 2019),
			album("Blonde", "Frank Ocean"),
			show("Detectorists", 2014),
			movie("Parasite", 2019),
			book("The Secret History", "Donna Tartt"),
			game("Hades", 2020),
			album("Since I Left You", "The Avalanches"),
			show("The Bear", 2022),
			movie("Fantastic Mr. Fox", 2009),
			book("Pachinko", "Min Jin Lee"),
			game("Celeste", 2018),
			album("Carrie & Lowell", "Sufjan Stevens"),
			show("Over the Garden Wall", 2014),
			movie("Aftersun", 2022),
			book("Station Eleven", "Emily St. John Mandel"),
			game("Firewatch", 2016),
			album("Madvillainy", "Madvillain"),
			movie("The Thing", 1982),
		],
	},
];

const TEST_USERS: SeedUser[] = [
	{
		username: "maya",
		name: "Maya Ortiz",
		bio: "Film nerd, slow reader, will cry at anything with a string section.",
		isPrivate: false,
		lists: [
			{
				slug: "seed-maya-a24",
				name: "A24 starter pack",
				emoji: "🎬",
				description: "Where to begin if your friend just won't stop talking about A24.",
				visibility: "public",
				layout: "grid",
				ranked: false,
				theme: "mint",
				items: [
					movie("Moonlight", 2016),
					movie("Lady Bird", 2017),
					movie("Hereditary", 2018),
					movie("The Green Knight", 2021),
					movie("Everything Everywhere All at Once", 2022),
					movie("Past Lives", 2023),
					movie("The Lighthouse", 2019),
					movie("Aftersun", 2022),
				],
			},
			{
				slug: "seed-maya-novels",
				name: "Novels that broke me",
				emoji: "💔",
				visibility: "public",
				layout: "list",
				ranked: true,
				theme: "blood-orange",
				items: [
					book("A Little Life", "Hanya Yanagihara", "I don't recommend it. I can't stop thinking about it."),
					book("Never Let Me Go", "Kazuo Ishiguro"),
					book("The Remains of the Day", "Kazuo Ishiguro", "Ishiguro twice, yes."),
					book("Beloved", "Toni Morrison"),
					book("Pachinko", "Min Jin Lee"),
					book("Normal People", "Sally Rooney"),
				],
			},
			{
				slug: "seed-maya-drafts",
				name: "drafts",
				visibility: "private",
				layout: "compact",
				ranked: false,
				theme: "fair",
				items: [movie("Past Lives", 2023), book("Klara and the Sun", "Kazuo Ishiguro")],
			},
		],
	},
	{
		username: "theo",
		name: "Theo Park",
		bio: "Games, headphones, too many tabs.",
		isPrivate: false,
		lists: [
			{
				slug: "seed-theo-jrpg",
				name: "JRPGs worth 80 hours",
				emoji: "⚔️",
				description: "Every one of these earns its runtime. Mostly.",
				visibility: "public",
				layout: "grid-lg",
				ranked: true,
				theme: "pop",
				items: [
					game("Chrono Trigger", 1995, "Still the gold standard."),
					game("Persona 5 Royal", 2019),
					game("Final Fantasy VI", 2022),
					game("Xenoblade Chronicles", 2010),
					game("Dragon Quest XI", 2017),
					game("Metaphor: ReFantazio", 2024),
					game("Final Fantasy VII Rebirth", 2024),
					game("Yakuza: Like a Dragon", 2020),
				],
			},
			{
				slug: "seed-theo-late-night",
				name: "Late-night albums",
				emoji: "🌙",
				visibility: "unlisted",
				layout: "grid-sm",
				ranked: false,
				theme: "deep-space",
				items: [
					album("Untrue", "Burial"),
					album("Blonde", "Frank Ocean"),
					album("Mezzanine", "Massive Attack"),
					album("Selected Ambient Works 85-92", "Aphex Twin"),
					album("Vespertine", "Björk"),
					album("Promises", "Floating Points"),
				],
			},
			{
				slug: "seed-theo-prestige",
				name: "Prestige TV, ranked",
				visibility: "public",
				layout: "compact",
				ranked: true,
				theme: "web",
				items: [
					show("The Sopranos", 1999),
					show("Mad Men", 2007),
					show("Succession", 2018),
					show("The Wire", 2002),
					show("Better Call Saul", 2015),
					show("Severance", 2022),
					show("Twin Peaks", 1990),
				],
			},
		],
	},
	{
		username: "juniper",
		name: "Juniper",
		bio: "This profile is private, so you shouldn't be reading this.",
		isPrivate: true,
		lists: [
			{
				slug: "seed-juniper-guilty",
				name: "Guilty pleasures",
				emoji: "🙈",
				description: "Public list on a private profile: only the direct link works.",
				visibility: "public",
				layout: "list",
				ranked: false,
				theme: "solar",
				items: [
					movie("Mamma Mia!", 2008),
					show("Love Island", 2015),
					album("1989", "Taylor Swift"),
					game("Stardew Valley", 2016),
					book("The Hunger Games", "Suzanne Collins"),
				],
			},
			{
				slug: "seed-juniper-mine",
				name: "For my eyes only",
				visibility: "private",
				layout: "grid",
				ranked: false,
				theme: "artisan",
				items: [movie("Twilight", 2008), show("Gossip Girl", 2007), album("Melodrama", "Lorde")],
			},
		],
	},
	// No name, no bio, no lists: the empty profile.
	{ username: "sam", isPrivate: false, lists: [] },
];

const SEED_EMAIL = "@seed.onda.test";

const normal = (s: string) =>
	s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]/g, "");

function score(pick: SeedPick, r: RecordInput) {
	let s = 0;
	if (normal(r.title) === normal(pick.title)) s += 4;
	if (pick.year && r.year === pick.year) s += 3;
	if (pick.by && r.creators.some((c) => normal(c).includes(normal(pick.by!)))) s += 3;
	if (r.image) s += 1;
	return s;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Both functions ship with the app, so each checks it's running locally. */
function requireLocal() {
	const site = process.env.SITE_URL ?? "";
	let host = "";
	try {
		const url = new URL(site.split(",")[0]!.trim());
		if (url.protocol === "http:" || url.protocol === "https:") host = url.hostname;
	} catch {}
	if (host !== "localhost" && !host.endsWith(".localhost")) {
		throw new ConvexError(`Seeding is for local dev only (SITE_URL is ${site || "unset"}).`);
	}
}

const vSeedList = v.object({
	slug: v.string(),
	name: v.string(),
	emoji: v.optional(v.string()),
	description: v.optional(v.string()),
	visibility: vVisibility,
	layout: vLayout,
	ranked: v.boolean(),
	theme: v.string(),
	items: v.array(v.object({ recordId: v.id("records"), note: v.optional(v.string()) })),
});

export const run = internalAction({
	args: { owner: v.optional(v.string()), email: v.optional(v.string()) },
	handler: async (
		ctx,
		{ owner = "natedunn", email = owner === "natedunn" ? "hello@natedunn.net" : undefined },
	): Promise<{ users: number; lists: number; items: number; records: number; missed: string[] }> => {
		requireLocal();
		const kinds = enabledKinds();
		const users: SeedUser[] = [
			{ username: owner, isPrivate: false, lists: OWNER_LISTS },
			...TEST_USERS,
		];

		// Resolve each distinct pick once.
		const found = new Map<string, Id<"records">>();
		const keyOf = (p: SeedPick) => `${p.kind}:${p.title}:${p.by ?? p.year ?? ""}`;
		const picks = new Map<string, SeedPick>();
		for (const u of users) for (const l of u.lists) for (const p of l.items) picks.set(keyOf(p), p);

		const missed: string[] = [];
		for (const [key, pick] of picks) {
			if (!kinds.includes(pick.kind)) {
				missed.push(`${key} (${pick.kind} search isn't set up)`);
				continue;
			}
			// With the creator first, then the title alone; repeats cover failed requests.
			const full = pick.by ? `${pick.title} ${pick.by}` : pick.title;
			const queries = [full, full, pick.title, pick.title];
			let best: RecordInput | undefined;
			let problem = "no results";
			for (const query of queries) {
				try {
					const results = await PROVIDERS[pick.kind].search(query);
					best = results
						.map((r, i) => ({ r, s: score(pick, r) - i * 0.01 }))
						.sort((a, b) => b.s - a.s)[0]?.r;
				} catch (error) {
					problem = error instanceof Error ? error.message : String(error);
				}
				// MusicBrainz allows one request a second.
				if (pick.kind === "album") await sleep(1100);
				if (best) break;
				await sleep(2000);
			}
			if (best) {
				const [record] = await ctx.runMutation(internal.media.upsert, { records: [best] });
				found.set(key, record!._id);
			} else {
				missed.push(`${key} (${problem})`);
			}
		}

		const summary: { users: number; lists: number; items: number } = await ctx.runMutation(internal.seed.write, {
			users: users.map((u) => ({
				username: u.username,
				name: u.name,
				bio: u.bio,
				isPrivate: u.isPrivate,
				isOwner: u.username === owner,
				email: u.username === owner ? email?.toLowerCase() : undefined,
				lists: u.lists.map(({ items, ...list }) => ({
					...list,
					items: items.flatMap((p) => {
						const recordId = found.get(keyOf(p));
						return recordId ? [{ recordId, note: p.note }] : [];
					}),
				})),
			})),
		});
		return { ...summary, records: found.size, missed };
	},
});

export const write = internalMutation({
	args: {
		users: v.array(
			v.object({
				username: v.string(),
				name: v.optional(v.string()),
				bio: v.optional(v.string()),
				isPrivate: v.boolean(),
				isOwner: v.boolean(),
				email: v.optional(v.string()),
				lists: v.array(vSeedList),
			}),
		),
	},
	handler: async (ctx, { users }) => {
		requireLocal();
		// Clear the previous seed.
		const deleteList = async (list: Doc<"lists">) => {
			const items = await ctx.db
				.query("items")
				.withIndex("by_list", (q) => q.eq("listId", list._id))
				.collect();
			for (const item of items) await ctx.db.delete(item._id);
			const images = await ctx.db
				.query("ogImages")
				.withIndex("by_list", (q) => q.eq("listId", list._id))
				.collect();
			for (const image of images) {
				await ctx.storage.delete(image.storageId);
				await ctx.db.delete(image._id);
			}
			await ctx.db.delete(list._id);
		};
		for (const list of await ctx.db.query("lists").collect()) {
			if (list.slug.startsWith("seed-")) await deleteList(list);
		}
		for (const user of await ctx.db.query("users").collect()) {
			if (!user.email?.endsWith(SEED_EMAIL)) continue;
			for (const list of await ctx.db
				.query("lists")
				.withIndex("by_owner", (q) => q.eq("ownerId", user._id))
				.collect()) {
				await deleteList(list);
			}
			await ctx.db.delete(user._id);
		}

		let lists = 0;
		let items = 0;
		// Spread updatedAt over the last few weeks so orderings look lived-in.
		let updatedAt = Date.now();
		for (const u of users) {
			let userId: Id<"users">;
			if (u.isOwner) {
				const byName = await ctx.db
					.query("users")
					.withIndex("by_username", (q) => q.eq("username", u.username))
					.unique();
				const byEmail = u.email
					? await ctx.db
							.query("users")
							.withIndex("by_email", (q) => q.eq("email", u.email))
							.first()
					: null;
				// Seeding one user while sign-in links the email to another would hide the lists.
				if (
					(byName && byEmail && byName._id !== byEmail._id) ||
					(byName?.email && u.email && byName.email !== u.email)
				) {
					throw new ConvexError(`"${u.username}" and ${u.email} belong to different users here.`);
				}
				const owner = byName ?? byEmail;
				if (owner) {
					userId = owner._id;
					// Signing in links to a user by verified email, so make sure it's there.
					if (u.email && !owner.email) await ctx.db.patch(userId, { email: u.email });
				} else if (u.email) {
					userId = await ctx.db.insert("users", {
						username: u.username,
						email: u.email,
						isPrivate: false,
					});
				} else {
					throw new ConvexError(`No user "${u.username}" yet. Pass an email or sign in first.`);
				}
			} else {
				const taken = await ctx.db
					.query("users")
					.withIndex("by_username", (q) => q.eq("username", u.username))
					.unique();
				if (taken) throw new ConvexError(`Username "${u.username}" belongs to a real user here.`);
				userId = await ctx.db.insert("users", {
					username: u.username,
					name: u.name,
					bio: u.bio,
					isPrivate: u.isPrivate,
					email: `${u.username}${SEED_EMAIL}`,
				});
			}

			for (const { items: listItems, ...list } of u.lists) {
				updatedAt -= Math.floor((3 + Math.random() * 40) * 3600_000);
				const listId = await ctx.db.insert("lists", {
					...list,
					ownerId: userId,
					seed: randomSeed(),
					itemCount: listItems.length,
					updatedAt,
				});
				for (const [position, item] of listItems.entries()) {
					await ctx.db.insert("items", { listId, recordId: item.recordId, position, note: item.note });
				}
				lists++;
				items += listItems.length;
			}
		}
		return { users: users.length, lists, items };
	},
});
