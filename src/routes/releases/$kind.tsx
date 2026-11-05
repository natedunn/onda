import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { ReleaseRow } from "@convex/releases";
import { INDIE_KINDS, KIND_LABELS, KINDS, type Kind } from "@convex/shared/constants";
import { addMonths, CALENDAR_MONTHS, isoDay, monthName } from "@convex/shared/releases";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ControlStrip } from "@/components/page-hero";
import { groupReleases, ReleaseItem } from "@/components/release-rows";
import { cn, plural } from "@/lib/utils";

/** This month and the ones after it that the calendar covers, as "2026-11". */
function calendarMonths() {
	const current = isoDay(Date.now()).slice(0, 7);
	return Array.from({ length: CALENDAR_MONTHS }, (_, i) => addMonths(current, i));
}

type Search = { month?: string; indie?: true };

export const Route = createFileRoute("/releases/$kind")({
	params: {
		parse: ({ kind }) => {
			if (!KINDS.includes(kind as Kind)) throw notFound();
			return { kind: kind as Kind };
		},
		stringify: ({ kind }) => ({ kind }),
	},
	// `month` is "2026-12" or "later" (dated only to a quarter or year); absent is this month.
	// Bad values have to be set to undefined; leaving them out keeps the raw one.
	validateSearch: (search: Record<string, unknown>): Search => ({
		month:
			typeof search.month === "string" && (search.month === "later" || calendarMonths().includes(search.month))
				? search.month
				: undefined,
		indie: search.indie === true || search.indie === "true" ? true : undefined,
	}),
	loaderDeps: ({ search }) => ({ month: search.month }),
	loader: async ({ context, params, deps }) => {
		const [kinds] = await Promise.all([
			context.queryClient.ensureQueryData(convexQuery(api.releases.kinds, {})),
			context.queryClient.ensureQueryData(
				convexQuery(api.releases.month, { kind: params.kind, month: deps.month ?? calendarMonths()[0] }),
			),
		]);
		if (!kinds.includes(params.kind)) throw notFound();
	},
	head: ({ params }) => ({
		meta: [
			{ title: `Upcoming ${KIND_LABELS[params.kind].many} · onda` },
			{ name: "description", content: `${KIND_LABELS[params.kind].title}s coming out, month by month.` },
		],
	}),
	component: KindReleases,
});

// Undated ("later") groups can run to hundreds; they show the most anticipated this many until asked.
const GROUP_PREVIEW = 24;

function KindReleases() {
	const { kind } = Route.useParams();
	const search = Route.useSearch();
	const months = calendarMonths();
	const month = search.month ?? months[0];
	const { data: all } = useSuspenseQuery(convexQuery(api.releases.month, { kind, month }));
	const indie = search.indie && INDIE_KINDS.includes(kind);
	const releases = indie ? all.filter((r) => r.indie) : all;
	const groups = groupReleases(releases);
	const later = month === "later";
	const labels = KIND_LABELS[kind];

	return (
		<div>
			<p className="text-[12px]">
				<Link to="/releases">← coming soon</Link>
			</p>
			<h1 className="mt-3 font-serif text-[clamp(2.4rem,6vw,3.6rem)] leading-[0.95] tracking-tight">
				Upcoming {labels.many}
			</h1>
			<p className="mt-3 text-[14px]">
				{later ? (
					<>
						{labels.title}s without a firm date yet, by the quarter or year they're due. Most anticipated
						first.
					</>
				) : (
					<>
						{plural(releases.length, `${indie ? "indie " : ""}${labels.one}`, `${indie ? "indie " : ""}${labels.many}`)}{" "}
						coming out in {monthName(month)}.
					</>
				)}
			</p>

			<ControlStrip className="mt-6">
				<ul className="flex flex-wrap gap-x-3 gap-y-1">
					{months.map((m) => (
						<li key={m}>
							<MonthLink month={m} current={month === m}>
								{monthName(m, "short")}
								{m.endsWith("-01") && <> ’{m.slice(2, 4)}</>}
							</MonthLink>
						</li>
					))}
					{/* Only games get announced as "Q1 2027"; TMDB's dates are always days. */}
					{kind === "game" && (
						<li>
							<MonthLink month="later" current={later}>
								date TBA
							</MonthLink>
						</li>
					)}
				</ul>
				{INDIE_KINDS.includes(kind) && (
					<Link
						to="."
						search={(prev: Search) => ({ ...prev, indie: prev.indie ? undefined : (true as const) })}
						className="linkish"
					>
						{search.indie ? "☑" : "☐"} indie only
					</Link>
				)}
			</ControlStrip>

			{groups.length === 0 ? (
				<p className="mt-8 text-muted">
					Nothing {indie ? "indie " : ""}
					{later ? "waiting on a date" : `dated for ${monthName(month)}`} yet.
				</p>
			) : (
				groups.map(({ key, ...group }) => <ReleaseGroup key={key} {...group} preview={later} />)
			)}

			<p className="mt-10 text-[11px] text-muted">
				{kind === "game" ? "Dates are from IGDB" : kind === "show" ? "Dates are from TMDB" : "Dates are US releases from TMDB"}, checked daily.
				{kind === "game" && " Games followed by at least a couple of people on IGDB."}
				{kind === "movie" && " Indie means none of the big studios or streamers produced it."}
				{kind === "show" && " New series and new seasons."}
			</p>
		</div>
	);
}

function MonthLink({ month, current, children }: { month: string; current: boolean; children: React.ReactNode }) {
	return (
		<Link
			to="."
			search={(prev: Search) => ({ ...prev, month })}
			aria-current={current ? "page" : undefined}
			className={cn("whitespace-nowrap", current && "plain bg-ink px-1 text-paper")}
		>
			{children}
		</Link>
	);
}

function ReleaseGroup({ heading, releases, preview }: { heading: string; releases: ReleaseRow[]; preview: boolean }) {
	const [expanded, setExpanded] = useState(false);
	// Each group shares one date, so it's already most anticipated first.
	const shown = preview && !expanded ? releases.slice(0, GROUP_PREVIEW) : releases;
	return (
		<section className="mt-8">
			<h2 className="label mb-1">{heading}</h2>
			<ol className="border-t border-rule">
				{shown.map((release) => (
					<ReleaseItem key={release._id} release={release} />
				))}
			</ol>
			{shown.length < releases.length && (
				<button type="button" className="linkish mt-2 text-[12px]" onClick={() => setExpanded(true)}>
					show all {releases.length}
				</button>
			)}
		</section>
	);
}
