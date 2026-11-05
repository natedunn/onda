// Copies the release calendar's album covers to R2, so its pages don't depend on
// Cover Art Archive and archive.org staying up. List art is copied as soon as
// something's on a list (images.ts); calendar albums are queued by releases.save,
// with their state on the `releases` row:
//   pending   not tried yet
//   missing   the source had no cover; tried again at artCheckAfter
//   copied    done
// One failed cover is skipped and retried tomorrow; several in a row mean the source
// is down, so the run stops there rather than trying the rest.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	type ActionCtx,
	internalAction,
	internalMutation,
	internalQuery,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import { SourceUnavailable, storeCopies } from "./images";
import { type RunResult, tracked } from "./jobs";
import { vSourceImage } from "./schema";
import type { SourceImage, StoredImage } from "./shared/images";
import { isoDay } from "./shared/releases";

const DAY = 24 * 60 * 60 * 1000;
const BATCH = 50;
// Actions get at least 10 minutes; hand on to a fresh one well before that.
const RUN_MS = 8 * 60 * 1000;
const SOON_DAYS = 14;
const RECHECK_DAYS = 7;
const RECHECK_SOON_DAYS = 2;
const STOP_AFTER_FAILURES = 5;
// Under a day, so a daily run always retries it.
const RETRY_MS = 12 * 60 * 60 * 1000;

/** The source image to copy: a record's own, or the one behind an empty copy of it. */
function sourceOf(record: Doc<"records">): SourceImage | undefined {
	const { image } = record;
	if (image?.host === "caa") return image;
	if (image?.host === "r2" && image.files.length === 0) return image.from;
	return undefined;
}

async function dueRows(ctx: QueryCtx, status: "pending" | "missing", now: number, limit: number) {
	return await ctx.db
		.query("releases")
		.withIndex("by_art", (q) => q.eq("artStatus", status).lte("artCheckAfter", now))
		.take(limit);
}

export const due = internalQuery({
	args: { limit: v.number() },
	handler: async (ctx, { limit }) => {
		const now = Date.now();
		const rows = [...(await dueRows(ctx, "pending", now, limit))];
		if (rows.length < limit) rows.push(...(await dueRows(ctx, "missing", now, limit - rows.length)));
		const out = [];
		for (const row of rows) {
			const record = await ctx.db.get(row.recordId);
			if (!record) continue;
			out.push({
				releaseId: row._id,
				recordId: row.recordId,
				kind: record.kind,
				sourceId: record.sourceId,
				image: sourceOf(record),
			});
		}
		return out;
	},
});

async function markMissing(ctx: MutationCtx, row: Doc<"releases">) {
	const now = Date.now();
	const soon = row.date <= isoDay(now + SOON_DAYS * DAY);
	await ctx.db.patch(row._id, {
		artStatus: "missing",
		artCheckedAt: now,
		artCheckAfter: now + (soon ? RECHECK_SOON_DAYS : RECHECK_DAYS) * DAY,
	});
}

export const saveResult = internalMutation({
	args: {
		releaseId: v.id("releases"),
		result: v.union(
			v.object({
				outcome: v.literal("copied"),
				from: vSourceImage,
				files: v.array(v.object({ path: v.string(), width: v.number(), height: v.number() })),
			}),
			v.object({ outcome: v.literal("missing") }),
			v.object({ outcome: v.literal("failed") }),
			// Nothing to fetch: the record has its own art already, or none to copy.
			v.object({ outcome: v.literal("settled") }),
		),
	},
	handler: async (ctx, { releaseId, result }) => {
		const row = await ctx.db.get(releaseId);
		if (!row) return;
		const now = Date.now();
		const done = { artStatus: "copied" as const, artCheckAfter: undefined, artCheckedAt: now };
		if (result.outcome === "missing") await markMissing(ctx, row);
		else if (result.outcome === "failed") await ctx.db.patch(row._id, { artCheckedAt: now, artCheckAfter: now + RETRY_MS });
		else if (result.outcome === "settled") await ctx.db.patch(row._id, done);
		else {
			const record = await ctx.db.get(row.recordId);
			const source = record && sourceOf(record);
			// The record moved on to another image while this one was copying.
			if (source?.id === result.from.id) {
				const image: StoredImage = { host: "r2", files: result.files, from: result.from, pinned: record!.image?.pinned };
				await ctx.db.patch(row.recordId, { image });
			}
			await ctx.db.patch(row._id, done);
		}
	},
});

type Tally = { copied: number; missing: number; failed: number };
const attempts = ({ copied, missing, failed }: Tally) => copied + missing + failed;

const summarize = ({ copied, missing, failed }: Tally) => `${copied} copied, ${missing} without a cover yet, ${failed} failed`;

/** Works through the queue, one batch per pass, until it's empty or the source is down. */
async function pass(ctx: ActionCtx, runId: Id<"jobRuns">, tally: Tally, max?: number): Promise<RunResult | null> {
	const startedAt = Date.now();
	let streak = 0;
	for (;;) {
		const batch = await ctx.runQuery(internal.releaseArt.due, { limit: BATCH });
		if (max !== undefined) batch.splice(max - attempts(tally));
		if (batch.length === 0) return { status: "ok", summary: summarize(tally) };
		for (const item of batch) {
			if (!item.image) {
				await ctx.runMutation(internal.releaseArt.saveResult, { releaseId: item.releaseId, result: { outcome: "settled" } });
				continue;
			}
			try {
				const files = await storeCopies({ kind: item.kind, sourceId: item.sourceId, image: item.image });
				const outcome = files.length ? ("copied" as const) : ("missing" as const);
				tally[outcome]++;
				streak = 0;
				await ctx.runMutation(internal.releaseArt.saveResult, {
					releaseId: item.releaseId,
					result: outcome === "copied" ? { outcome, from: item.image, files } : { outcome },
				});
			} catch (error) {
				console.error(`art ${item.sourceId} failed`, error);
				tally.failed++;
				await ctx.runMutation(internal.releaseArt.saveResult, { releaseId: item.releaseId, result: { outcome: "failed" } });
				if (error instanceof SourceUnavailable && ++streak >= STOP_AFTER_FAILURES) {
					return { status: "stopped", summary: `${summarize(tally)}. Stopped: ${error.message}` };
				}
			}
		}
		if (Date.now() - startedAt > RUN_MS) {
			await ctx.scheduler.runAfter(0, internal.releaseArt.resume, { runId, ...tally, max });
			return null;
		}
	}
}

/** Copies what's due. Run daily from crons.ts; by hand, `max` limits it to a few albums. */
export const copyDue = internalAction({
	args: { max: v.optional(v.number()) },
	handler: async (ctx, { max }) => {
		await tracked(ctx, "art:album", (runId) => pass(ctx, runId, { copied: 0, missing: 0, failed: 0 }, max));
	},
});

/** Carries a long run on in a fresh action. */
export const resume = internalAction({
	args: {
		runId: v.id("jobRuns"),
		copied: v.number(),
		missing: v.number(),
		failed: v.number(),
		max: v.optional(v.number()),
	},
	handler: async (ctx, { runId, max, ...tally }) => {
		try {
			const result = await pass(ctx, runId, tally, max);
			if (result) await ctx.runMutation(internal.jobs.finish, { runId, ...result });
		} catch (error) {
			await ctx.runMutation(internal.jobs.finish, { runId, status: "failed", error: String(error).slice(0, 500) });
		}
	},
});
