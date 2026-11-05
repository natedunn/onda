// The release calendar. A daily cron per kind asks the source what's coming
// out (providers.ts `upcoming`), saves each as an ordinary record, as search
// does, so its item page and "add to list" work, and keeps one `releases` row
// per record with the date. Rows a sync no longer finds are dropped after a few
// days, which covers cancellations and releases that have come and gone.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, query, type QueryCtx } from "./_generated/server";
import { upsertRecord } from "./media";
import { enabledKinds, PROVIDERS } from "./providers";
import { recordFields, vKind } from "./schema";
import type { Kind } from "./shared/constants";
import { isoDay, precisionOf, RECENT_DAYS, RELEASE_SORTS } from "./shared/releases";

const DAY = 24 * 60 * 60 * 1000;
// A release missing from this many days of syncs is gone (moved out of range,
// cancelled, or dropped below the source's popularity cut).
const UNSEEN_DAYS = 3;
const SAVE_BATCH = 40;
// The overview shows this many per kind, from the next few weeks.
const OVERVIEW_COUNT = 8;
const OVERVIEW_DAYS = 30;
// "Soonest" skips releases scoring under these, or the next few days would be all
// unknowns. Set from real scores; a kind's scale is its source's own.
const SOONEST_FLOORS: Partial<Record<Kind, number>> = { movie: 10, show: 20, game: 10 };
// A month page shows everything; this is only a guard.
const MONTH_LIMIT = 500;

/** Kinds with a calendar: enabled, and their source can list upcoming releases. */
export function calendarKinds(): Kind[] {
	return enabledKinds().filter((kind) => PROVIDERS[kind].upcoming);
}

export const kinds = query({
	args: {},
	handler: async () => calendarKinds(),
});

// --- Sync ------------------------------------------------------------------

/** Fetch a kind's upcoming releases and save them. Run daily from crons.ts. */
export const sync = internalAction({
	args: { kind: vKind },
	handler: async (ctx, { kind }) => {
		if (!calendarKinds().includes(kind)) return;
		const startedAt = Date.now();
		const from = isoDay(startedAt - RECENT_DAYS * DAY);
		let releases;
		try {
			releases = await PROVIDERS[kind].upcoming!(from);
		} catch (error) {
			// Nothing is swept on a failed sync, so yesterday's calendar stays up.
			console.error(`release sync ${kind} failed`, error);
			return;
		}
		for (let i = 0; i < releases.length; i += SAVE_BATCH) {
			await ctx.runMutation(internal.releases.save, {
				kind,
				seenAt: startedAt,
				releases: releases.slice(i, i + SAVE_BATCH),
			});
		}
		await ctx.runMutation(internal.releases.sweep, { kind, before: startedAt - UNSEEN_DAYS * DAY });
		console.log(`release sync ${kind}: ${releases.length} releases`);
	},
});

export const save = internalMutation({
	args: {
		kind: vKind,
		seenAt: v.number(),
		releases: v.array(
			v.object({
				record: v.object(recordFields),
				date: v.string(),
				detail: v.optional(v.string()),
				score: v.number(),
				indie: v.boolean(),
			}),
		),
	},
	handler: async (ctx, { kind, seenAt, releases }) => {
		for (const { record: input, ...release } of releases) {
			if (input.kind !== kind) throw new ConvexError(`Expected a ${kind}, got a ${input.kind}`);
			const record = await upsertRecord(ctx, input);
			const existing = await ctx.db
				.query("releases")
				.withIndex("by_record", (q) => q.eq("recordId", record._id))
				.unique();
			const row = { ...release, kind, recordId: record._id, precision: precisionOf(release.date), seenAt };
			if (!existing) {
				await ctx.db.insert("releases", row);
			} else {
				const moved = existing.date !== release.date;
				await ctx.db.patch(existing._id, {
					...row,
					previousDate: moved ? existing.date : existing.previousDate,
				});
			}
		}
	},
});

/** Drops a kind's releases that no sync has found since `before`. */
export const sweep = internalMutation({
	args: { kind: vKind, before: v.number() },
	handler: async (ctx, { kind, before }) => {
		const stale = await ctx.db
			.query("releases")
			.withIndex("by_kind_seen", (q) => q.eq("kind", kind).lt("seenAt", before))
			.take(200);
		for (const row of stale) await ctx.db.delete(row._id);
		if (stale.length === 200) await ctx.scheduler.runAfter(0, internal.releases.sweep, { kind, before });
	},
});

// --- Pages -----------------------------------------------------------------

export type ReleaseRow = Awaited<ReturnType<typeof withRecords>>[number];

/** Rows with what the calendar shows of their record, and how many public lists it's on. */
async function withRecords(ctx: QueryCtx, rows: Doc<"releases">[]) {
	const out = [];
	for (const row of rows) {
		const record = await ctx.db.get(row.recordId);
		if (!record) continue;
		out.push({
			_id: row._id,
			date: row.date,
			previousDate: row.previousDate,
			detail: row.detail,
			indie: row.indie,
			record: {
				kind: record.kind,
				sourceId: record.sourceId,
				title: record.title,
				creators: record.creators,
				image: record.image,
			},
			lists: await publicListCount(ctx, row.recordId),
		});
	}
	return out;
}

// Counting stops here; the calendar shows "20+".
const LIST_COUNT_CAP = 20;

/** Public lists by public profiles that have this record, as on the item page. */
async function publicListCount(ctx: QueryCtx, recordId: Id<"records">) {
	const items = await ctx.db
		.query("items")
		.withIndex("by_record", (q) => q.eq("recordId", recordId))
		.take(LIST_COUNT_CAP);
	let count = 0;
	for (const item of items) {
		const list = await ctx.db.get(item.listId);
		if (list?.visibility !== "public") continue;
		const owner = await ctx.db.get(list.ownerId);
		if (owner && !owner.isPrivate) count++;
	}
	return count;
}

const bySoonest = (a: Doc<"releases">, b: Doc<"releases">) => a.date.localeCompare(b.date) || b.score - a.score;

/**
 * A few of each kind from the next month, in date order: the next ones that clear
 * the kind's floor, or with `sort: "popular"` the highest scoring.
 */
export const overview = query({
	args: { sort: v.union(...RELEASE_SORTS.map((sort) => v.literal(sort))) },
	handler: async (ctx, { sort }) => {
		const today = isoDay(Date.now());
		const until = isoDay(Date.now() + OVERVIEW_DAYS * DAY);
		const sections = [];
		for (const kind of calendarKinds()) {
			const soon = await ctx.db
				.query("releases")
				.withIndex("by_kind_date", (q) => q.eq("kind", kind).gte("date", today).lte("date", until))
				.take(MONTH_LIMIT);
			const picks =
				sort === "popular"
					? soon.sort((a, b) => b.score - a.score)
					: soon.filter((r) => r.score >= (SOONEST_FLOORS[kind] ?? 0)).sort(bySoonest);
			const top = picks.slice(0, OVERVIEW_COUNT).sort(bySoonest);
			sections.push({ kind, releases: await withRecords(ctx, top) });
		}
		return sections;
	},
});

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * One kind's releases in a month ("2026-12"), or with `month: "later"`, the ones
 * dated only to a quarter or a year. Sorted by date, then most anticipated first.
 */
export const month = query({
	args: { kind: vKind, month: v.string() },
	handler: async (ctx, { kind, month }) => {
		let rows: Doc<"releases">[];
		if (month === "later") {
			const year = isoDay(Date.now()).slice(0, 4);
			rows = [];
			for (const precision of ["quarter", "year"] as const) {
				rows.push(
					...(await ctx.db
						.query("releases")
						.withIndex("by_kind_precision", (q) =>
							q.eq("kind", kind).eq("precision", precision).gte("date", year),
						)
						.take(MONTH_LIMIT)),
				);
			}
		} else {
			if (!MONTH.test(month)) throw new ConvexError("Not a month");
			// "~" sorts after every digit and "Q", so this is the whole month.
			rows = await ctx.db
				.query("releases")
				.withIndex("by_kind_date", (q) => q.eq("kind", kind).gte("date", month).lt("date", `${month}~`))
				.take(MONTH_LIMIT);
		}
		rows.sort(bySoonest);
		return await withRecords(ctx, rows);
	},
});
