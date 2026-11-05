// The admin page. Everything here checks the signed-in user's verified email.
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { ADMIN_EMAIL, KINDS } from "./shared/constants";
import { JOBS } from "./shared/jobs";
import { isoDay } from "./shared/releases";

const RECENT_RUNS = 40;
const LIST_LIMIT = 15;
const SCAN_LIMIT = 2000;

async function isAdmin(ctx: QueryCtx) {
	const userId = await getAuthUserId(ctx);
	if (userId === null) return false;
	const user = await ctx.db.get(userId as Id<"users">);
	return user?.email === ADMIN_EMAIL;
}

/** Null for anyone else, so the page can answer as if it didn't exist. */
export const dashboard = query({
	args: {},
	handler: async (ctx) => {
		if (!(await isAdmin(ctx))) return null;

		const jobs = [];
		for (const job of JOBS) {
			const last = await ctx.db
				.query("jobRuns")
				.withIndex("by_job", (q) => q.eq("job", job.id))
				.order("desc")
				.first();
			jobs.push({ ...job, last });
		}
		const runs = await ctx.db.query("jobRuns").withIndex("by_started").order("desc").take(RECENT_RUNS);

		const today = isoDay(Date.now());
		const releases = [];
		const moved: Doc<"releases">[] = [];
		for (const kind of KINDS) {
			const rows = await ctx.db
				.query("releases")
				.withIndex("by_kind_date", (q) => q.eq("kind", kind))
				.take(SCAN_LIMIT);
			if (rows.length === 0) continue;
			releases.push({
				kind,
				total: rows.length,
				upcoming: rows.filter((r) => r.date >= today).length,
				seenAt: Math.max(...rows.map((r) => r.seenAt)),
			});
			moved.push(...rows.filter((r) => r.previousDate && r.previousDate !== r.date && r.date >= today));
		}

		const titled = async (rows: Doc<"releases">[]) => {
			const out = [];
			for (const row of rows) {
				const record = await ctx.db.get(row.recordId);
				out.push({
					_id: row._id,
					kind: row.kind,
					sourceId: record?.sourceId ?? "",
					title: record?.title ?? "(missing record)",
					date: row.date,
					previousDate: row.previousDate,
					artStatus: row.artStatus,
					artCheckAfter: row.artCheckAfter,
					artCheckedAt: row.artCheckedAt,
				});
			}
			return out;
		};

		const art = [];
		for (const status of ["pending", "missing", "copied"] as const) {
			const rows = await ctx.db
				.query("releases")
				.withIndex("by_art", (q) => q.eq("artStatus", status))
				.take(SCAN_LIMIT);
			art.push({ status, count: rows.length, next: await titled(status === "copied" ? [] : rows.slice(0, LIST_LIMIT)) });
		}

		moved.sort((a, b) => a.date.localeCompare(b.date));
		return { jobs, runs, releases, art, moved: await titled(moved.slice(0, LIST_LIMIT)) };
	},
});
