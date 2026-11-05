// A log of scheduled job runs, for the admin page.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalMutation } from "./_generated/server";
import { vRunStatus } from "./schema";
import type { JobId } from "./shared/jobs";

const KEEP_DAYS = 30;

export type RunResult = { status: "ok" | "stopped"; summary: string };

export const start = internalMutation({
	args: { job: v.string() },
	handler: async (ctx, { job }) =>
		await ctx.db.insert("jobRuns", { job, startedAt: Date.now(), status: "running" }),
});

export const finish = internalMutation({
	args: {
		runId: v.id("jobRuns"),
		status: vRunStatus,
		summary: v.optional(v.string()),
		error: v.optional(v.string()),
	},
	handler: async (ctx, { runId, ...result }) => {
		await ctx.db.patch(runId, { ...result, finishedAt: Date.now() });
	},
});

/** Runs `fn` as a logged run of `job`. A thrown error is logged here, not rethrown. */
export async function tracked(ctx: ActionCtx, job: JobId, fn: (runId: Id<"jobRuns">) => Promise<RunResult | null>) {
	const runId = await ctx.runMutation(internal.jobs.start, { job });
	try {
		// Null means fn handed the run on to a scheduled continuation that will finish it.
		const result = await fn(runId);
		if (result) await ctx.runMutation(internal.jobs.finish, { runId, ...result });
	} catch (error) {
		console.error(`${job} failed`, error);
		await ctx.runMutation(internal.jobs.finish, { runId, status: "failed", error: String(error).slice(0, 500) });
	}
}

/** Drops old runs; run daily from crons.ts. */
export const prune = internalMutation({
	args: {},
	handler: async (ctx) => {
		const old = await ctx.db
			.query("jobRuns")
			.withIndex("by_started", (q) => q.lt("startedAt", Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000))
			.take(500);
		for (const run of old) await ctx.db.delete(run._id);
		if (old.length === 500) await ctx.scheduler.runAfter(0, internal.jobs.prune, {});
	},
});
