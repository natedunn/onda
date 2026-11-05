// Scheduled jobs, for crons.ts and the admin page. Times are UTC, a few minutes
// apart so the syncs don't overlap; art runs after the album sync queues new covers.
export const JOBS = [
	{ id: "sync:movie", label: "Movie releases", hourUTC: 10, minuteUTC: 0 },
	{ id: "sync:game", label: "Game releases", hourUTC: 10, minuteUTC: 15 },
	{ id: "sync:show", label: "Show releases", hourUTC: 10, minuteUTC: 30 },
	{ id: "sync:album", label: "Album releases", hourUTC: 10, minuteUTC: 45 },
	{ id: "art:album", label: "Album covers", hourUTC: 11, minuteUTC: 0 },
] as const;

export type JobId = (typeof JOBS)[number]["id"];
