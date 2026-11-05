import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { KIND_LABELS } from "@convex/shared/constants";
import { releaseLabel } from "@convex/shared/releases";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Art } from "@/components/art";
import { Moved } from "@/components/release-rows";

export const Route = createFileRoute("/releases/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.releases.overview, {}));
	},
	head: () => ({
		meta: [
			{ title: "Coming soon · onda" },
			{ name: "description", content: "Movies, shows and games coming out soon." },
		],
	}),
	component: Releases,
});

// Each poster is a quarter of the column on phones and an eighth from sm up.
const POSTER_SIZES = "(min-width: 640px) 128px, 25vw";

function Releases() {
	const { data: sections } = useSuspenseQuery(convexQuery(api.releases.overview, {}));

	return (
		<div>
			<h1 className="font-serif text-[clamp(2.4rem,6vw,3.6rem)] leading-[0.95] tracking-tight">Coming soon</h1>
			<p className="mt-3 text-[14px]">
				The most anticipated releases of the next month. Dates move; this checks for changes every day.
			</p>

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
											<Art image={record.image} kind={record.kind} alt="" sizes={POSTER_SIZES} />
											<p className="mt-2 text-[13px] font-bold">{releaseLabel(release.date)}</p>
											<p className="line-clamp-2 text-[14px] leading-snug group-hover:underline">{record.title}</p>
										</Link>
										{release.previousDate && (
											<p className="mt-1 text-[12px]">
												<Moved release={release} />
											</p>
										)}
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
