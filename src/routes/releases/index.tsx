import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { KIND_LABELS } from "@convex/shared/constants";
import { RELEASE_SORT_LABELS, RELEASE_SORTS, releaseLabel, type ReleaseSort } from "@convex/shared/releases";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Art } from "@/components/art";
import { ControlStrip } from "@/components/page-hero";
import { readReleaseSort, saveReleaseSort } from "@/lib/release-sort";

export const Route = createFileRoute("/releases/")({
	// Bad values have to be set to undefined; leaving them out keeps the raw one.
	validateSearch: (search: Record<string, unknown>): { sort?: ReleaseSort } => ({
		sort: RELEASE_SORTS.includes(search.sort as ReleaseSort) ? (search.sort as ReleaseSort) : undefined,
	}),
	// The URL always says what's showing, so it can be shared; a shared link wins over
	// this device's saved sort, and only picking a sort changes what's saved.
	beforeLoad: async ({ search }) => {
		if (!search.sort) throw redirect({ to: "/releases", search: { sort: await readReleaseSort() }, replace: true });
	},
	loaderDeps: ({ search }) => ({ sort: search.sort }),
	loader: async ({ context, deps }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.releases.overview, { sort: deps.sort! }));
	},
	head: () => ({
		meta: [
			{ title: "Coming soon · onda" },
			{ name: "description", content: "Movies, shows, albums and games coming out soon." },
		],
	}),
	component: Releases,
});

// Each poster is a quarter of the column on phones and an eighth from sm up.
const POSTER_SIZES = "(min-width: 640px) 128px, 25vw";

function Releases() {
	const sort = Route.useSearch({ select: (search) => search.sort! });
	const navigate = Route.useNavigate();
	const { data: sections } = useSuspenseQuery(convexQuery(api.releases.overview, { sort }));

	return (
		<div>
			<h1 className="font-serif text-[clamp(2.4rem,6vw,3.6rem)] leading-[0.95] tracking-tight">Coming soon</h1>
			<p className="mt-3 text-[14px]">
				See the most anticipated and upcoming releases.
			</p>

			<ControlStrip className="mt-6">
				<label className="flex items-center gap-3">
					<span className="label">Sort</span>
					<select
						className="field py-1 pl-2.5 text-[13px] leading-6 pointer-coarse:text-[16px]"
						value={sort}
						onChange={(e) => {
							const next = e.target.value as ReleaseSort;
							saveReleaseSort(next);
							void navigate({ search: { sort: next }, replace: true, resetScroll: false });
						}}
					>
						{RELEASE_SORTS.map((option) => (
							<option key={option} value={option}>
								{RELEASE_SORT_LABELS[option]}
							</option>
						))}
					</select>
				</label>
			</ControlStrip>

			{sections.length === 0 && <p className="mt-10 text-muted">The calendar isn't set up here yet.</p>}

			{sections.map(({ kind, releases }) => (
				<section key={kind} className="mt-12">
					<div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
						<h2 className="label">{KIND_LABELS[kind].many}</h2>
						<Link to="/releases/$kind" params={{ kind }} className="text-[12px]">
							all upcoming {KIND_LABELS[kind].many} →
						</Link>
					</div>
					{releases.length === 0 ? (
						<p className="text-muted">Nothing dated in the next month.</p>
					) : (
						<ol className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-8">
							{releases.map((release) => {
								const { record } = release;
								return (
									<li key={release._id} className="min-w-0">
										<Link
											to="/$kind/$id"
											params={{ kind: record.kind, id: record.sourceId }}
											className="plain group block"
										>
											<div className="halftone art-lift">
												<Art image={record.image} kind={record.kind} alt="" sizes={POSTER_SIZES} />
											</div>
											<p className="mt-2 text-[13px] font-bold">{releaseLabel(release.date)}</p>
											<p className="line-clamp-2 text-[14px] leading-snug group-hover:underline">{record.title}</p>
										</Link>
									</li>
								);
							})}
						</ol>
					)}
				</section>
			))}
		</div>
	);
}
