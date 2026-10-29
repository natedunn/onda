import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("prune search cache", { hourUTC: 9, minuteUTC: 0 }, internal.media.pruneSearchCache, {});

export default crons;
