import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { KIND_LABELS, type Kind } from "@convex/shared/constants";
import { releaseLabel } from "@convex/shared/releases";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn, timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
	loader: async ({ context }) => {
		const data = await context.queryClient.ensureQueryData(convexQuery(api.admin.dashboard, {}));
		if (!data) throw notFound();
	},
	head: () => ({ meta: [{ title: "Admin · onda" }, { name: "robots", content: "noindex" }] }),
	component: Admin,
});

// A run still "running" after this long died without reporting back.
const STALE_MS = 30 * 60 * 1000;
const IMPORT_RUNS = "https://github.com/natedunn/onda/actions/workflows/music-import.yml";
const ART_STATUS = {
	pending: { label: "Waiting to copy", note: "New covers, up next." },
	missing: { label: "No cover yet", note: "Checked again on the date shown." },
	copied: { label: "Copied to R2", note: "Done." },
} as const;

type Run = Doc<"jobRuns">;

function runState(run: Run) {
	if (run.status === "running" && Date.now() - run.startedAt > STALE_MS) return "lost";
	return run.status;
}

const STATE_STYLES: Record<string, string> = {
	ok: "text-muted",
	running: "bg-mark text-ink",
	stopped: "bg-mark text-ink",
	failed: "bg-ink text-paper",
	lost: "bg-ink text-paper",
};

function State({ run }: { run: Run }) {
	const state = runState(run);
	return <span className={cn("px-1", STATE_STYLES[state])}>{state}</span>;
}

function took(run: Run) {
	if (!run.finishedAt) return "—";
	const seconds = Math.round((run.finishedAt - run.startedAt) / 1000);
	return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
}

/** The next daily run, as a day and time in UTC. */
function nextRun(hourUTC: number, minuteUTC: number) {
	const now = new Date();
	const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUTC, minuteUTC));
	if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
	return timeAgo(next.getTime());
}

const when = (ms: number) =>
	new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false });

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
	return (
		<section className="mt-12">
			<h2 className="label">{title}</h2>
			{note && <p className="mt-1 text-[12px] text-muted">{note}</p>}
			<div className="mt-2 overflow-x-auto">{children}</div>
		</section>
	);
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
	return (
		<table className="w-full border-collapse text-left text-[13px]">
			<thead>
				<tr className="border-y border-rule text-[11px] text-muted">
					{head.map((h) => (
						<th key={h} className="py-1.5 pr-4 font-normal whitespace-nowrap">
							{h}
						</th>
					))}
				</tr>
			</thead>
			<tbody className="[&_td]:border-b [&_td]:border-rule [&_td]:py-1.5 [&_td]:pr-4 [&_td]:align-top">{children}</tbody>
		</table>
	);
}

function ItemLink({ item }: { item: { kind: Kind; sourceId: string; title: string } }) {
	return (
		<Link to="/$kind/$id" params={{ kind: item.kind, id: item.sourceId }}>
			{item.title}
		</Link>
	);
}

function Admin() {
	const { data } = useSuspenseQuery(convexQuery(api.admin.dashboard, {}));
	if (!data) return null;
	const { jobs, runs, releases, art, moved } = data;
	const labels = Object.fromEntries(jobs.map((j) => [j.id, j.label]));

	return (
		<div>
			<h1 className="font-serif text-[clamp(2.4rem,6vw,3.6rem)] leading-[0.95] tracking-tight">Admin</h1>
			<p className="mt-3 text-[14px]">What the scheduled jobs have been up to. Times are UTC.</p>

			<Section
				title="Scheduled jobs"
				note={
					<>
						The music mirror import runs on GitHub, so it isn't here:{" "}
						<a href={IMPORT_RUNS} target="_blank" rel="noopener noreferrer">
							import runs ↗
						</a>
					</>
				}
			>
				<Table head={["Job", "Status", "Last run", "Took", "Next run", "Result"]}>
					{jobs.map((job) => (
						<tr key={job.id}>
							<td className="whitespace-nowrap">{job.label}</td>
							<td>{job.last ? <State run={job.last} /> : <span className="text-muted">never run</span>}</td>
							<td className="whitespace-nowrap">{job.last ? timeAgo(job.last.startedAt) : "—"}</td>
							<td>{job.last ? took(job.last) : "—"}</td>
							<td className="whitespace-nowrap">{nextRun(job.hourUTC, job.minuteUTC)}</td>
							<td className="text-muted">{job.last?.error ?? job.last?.summary}</td>
						</tr>
					))}
				</Table>
			</Section>

			<Section title="Calendar">
				<Table head={["Kind", "Upcoming", "On the calendar", "Last synced"]}>
					{releases.map((row) => (
						<tr key={row.kind}>
							<td>{KIND_LABELS[row.kind].title}s</td>
							<td>{row.upcoming}</td>
							<td>{row.total}</td>
							<td>{timeAgo(row.seenAt)}</td>
						</tr>
					))}
				</Table>
			</Section>

			<Section title="Album covers" note="Copies upcoming albums' art to R2.">
				<Table head={["State", "Albums", "What it means"]}>
					{art.map((row) => (
						<tr key={row.status}>
							<td>{ART_STATUS[row.status].label}</td>
							<td>{row.count}</td>
							<td className="text-muted">{ART_STATUS[row.status].note}</td>
						</tr>
					))}
				</Table>
				{art
					.filter((row) => row.next.length > 0)
					.map((row) => (
						<div key={row.status} className="mt-6">
							<h3 className="mb-1 text-[12px] text-muted">
								{ART_STATUS[row.status].label}
								{row.count > row.next.length && `: next ${row.next.length} of ${row.count}`}
							</h3>
							<Table head={["Album", "Out", "Next check", "Last checked"]}>
								{row.next.map((item) => (
									<tr key={item._id}>
										<td>
											<ItemLink item={item} />
										</td>
										<td className="whitespace-nowrap">{releaseLabel(item.date, true)}</td>
										<td className="whitespace-nowrap">{item.artCheckAfter ? when(item.artCheckAfter) : "—"}</td>
										<td className="whitespace-nowrap">{item.artCheckedAt ? timeAgo(item.artCheckedAt) : "never"}</td>
									</tr>
								))}
							</Table>
						</div>
					))}
			</Section>

			{moved.length > 0 && (
				<Section title="Dates that moved" note="Upcoming releases whose date has changed, soonest first.">
					<Table head={["Title", "Kind", "Was", "Now"]}>
						{moved.map((item) => (
							<tr key={item._id}>
								<td>
									<ItemLink item={item} />
								</td>
								<td>{KIND_LABELS[item.kind].one}</td>
								<td className="whitespace-nowrap">{item.previousDate && releaseLabel(item.previousDate, true)}</td>
								<td className="whitespace-nowrap">{releaseLabel(item.date, true)}</td>
							</tr>
						))}
					</Table>
				</Section>
			)}

			<Section title="Recent runs" note="Kept for a month.">
				{runs.length === 0 ? (
					<p className="text-muted">Nothing has run yet.</p>
				) : (
					<Table head={["Started", "Job", "Status", "Took", "Result"]}>
						{runs.map((run) => (
							<tr key={run._id}>
								<td className="whitespace-nowrap">{when(run.startedAt)}</td>
								<td className="whitespace-nowrap">{labels[run.job] ?? run.job}</td>
								<td>
									<State run={run} />
								</td>
								<td>{took(run)}</td>
								<td className="text-muted">{run.error ?? run.summary}</td>
							</tr>
						))}
					</Table>
				)}
			</Section>
		</div>
	);
}
