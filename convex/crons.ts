import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import type { Kind } from "./shared/constants";
import { JOBS } from "./shared/jobs";

const crons = cronJobs();

crons.daily("prune search cache", { hourUTC: 9, minuteUTC: 0 }, internal.media.pruneSearchCache, {});

crons.daily("prune job runs", { hourUTC: 9, minuteUTC: 15 }, internal.jobs.prune, {});

for (const { id, label, hourUTC, minuteUTC } of JOBS) {
	const [type, kind] = id.split(":");
	if (type === "sync") crons.daily(label, { hourUTC, minuteUTC }, internal.releases.sync, { kind: kind as Kind });
	else crons.daily(label, { hourUTC, minuteUTC }, internal.releaseArt.copyDue, {});
}

export default crons;
