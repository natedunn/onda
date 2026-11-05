import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("prune search cache", { hourUTC: 9, minuteUTC: 0 }, internal.media.pruneSearchCache, {});

// The release calendar, a few minutes apart so the syncs don't overlap.
crons.daily("sync movie releases", { hourUTC: 10, minuteUTC: 0 }, internal.releases.sync, { kind: "movie" });
crons.daily("sync game releases", { hourUTC: 10, minuteUTC: 15 }, internal.releases.sync, { kind: "game" });

export default crons;
