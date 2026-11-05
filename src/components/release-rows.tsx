import type { ReleaseRow } from "@convex/releases";
import { dayHeading, precisionOf, releaseLabel } from "@convex/shared/releases";
import { Link } from "@tanstack/react-router";
import { Art } from "@/components/art";
import { plural } from "@/lib/utils";

/** A release's date move, if it has one: "moved from Oct 12". */
export function Moved({ release }: { release: { date: string; previousDate?: string } }) {
	if (!release.previousDate || release.previousDate === release.date) return null;
	const later = release.previousDate < release.date;
	return (
		<span className="bg-mark px-1 text-ink">
			{later ? "delayed" : "moved up"} from {releaseLabel(release.previousDate, true)}
		</span>
	);
}

/** One release as a row: art, title, who made it, and the platform/kind of release. */
export function ReleaseItem({ release }: { release: ReleaseRow }) {
	const { record } = release;
	const params = { kind: record.kind, id: record.sourceId };
	const notes = [record.creators.slice(0, 2).join(", "), release.detail].filter(Boolean);
	return (
		<li className="flex items-center gap-4 border-b border-rule py-3.5 sm:gap-5">
			<Link to="/$kind/$id" params={params} className="plain w-16 shrink-0 sm:w-20" tabIndex={-1}>
				<div className="halftone art-lift">
					<Art image={record.image} kind={record.kind} alt="" sizes="(min-width: 640px) 80px, 64px" />
				</div>
			</Link>
			<div className="min-w-0 flex-1">
				<Link to="/$kind/$id" params={params} className="font-serif text-[1.65rem] leading-[1.1] tracking-tight [overflow-wrap:anywhere] sm:text-[1.9rem]">
					{record.title}
				</Link>
				<p className="mt-1 flex flex-wrap gap-x-2 text-[13px] text-muted">
					{notes.length > 0 && <span>{notes.join(" · ")}</span>}
					{release.indie && <span>indie</span>}
					<Moved release={release} />
				</p>
			</div>
			{release.lists > 0 && (
				<span className="shrink-0 text-[13px] text-muted">
					on {release.lists >= 20 ? "20+ lists" : plural(release.lists, "list")}
				</span>
			)}
		</li>
	);
}

type Group = { key: string; heading: string; releases: ReleaseRow[] };

/**
 * Releases under date headings, in order: a month's undated ones ("Sometime in
 * December") before its days; a year's quarters before "Sometime in 2027".
 */
export function groupReleases(releases: ReleaseRow[]): Group[] {
	const groups = new Map<string, Group>();
	for (const release of releases) {
		const { date } = release;
		const precision = precisionOf(date);
		// Year-only dates sort after that year's quarters.
		const key = precision === "year" ? `${date}-~` : date;
		const heading =
			precision === "day"
				? dayHeading(date)
				: precision === "month" || precision === "year"
					? `Sometime in ${releaseLabel(date)}`
					: releaseLabel(date);
		const group = groups.get(key) ?? { key, heading, releases: [] };
		group.releases.push(release);
		groups.set(key, group);
	}
	return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
