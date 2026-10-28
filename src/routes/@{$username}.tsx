import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { KIND_LABELS, KINDS } from "@convex/shared/constants";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ListRows } from "@/components/list-rows";
import { NewListButton } from "@/components/new-list-button";
import { ControlStrip, PageHero } from "@/components/page-hero";
import { plural } from "@/lib/utils";

export const Route = createFileRoute("/@{$username}")({
	loader: async ({ context, params }) => {
		const data = await context.queryClient.ensureQueryData(
			convexQuery(api.users.profile, { username: params.username }),
		);
		if (!data) throw notFound();
		return { bio: data.user?.bio, isPrivate: data.user === null };
	},
	head: ({ params, loaderData }) => ({
		meta: [
			{ title: `@${params.username} · onda` },
			{ name: "description", content: loaderData?.bio ?? `@${params.username}'s lists on onda.` },
			...(loaderData?.isPrivate ? [{ name: "robots", content: "noindex" }] : []),
		],
	}),
	component: Profile,
});

function Profile() {
	const { username } = Route.useParams();
	const { data } = useSuspenseQuery(convexQuery(api.users.profile, { username }));
	if (!data) return null;
	if (!data.user) {
		return (
			<div className="py-10">
				<h1 className="font-serif text-5xl">@{username}</h1>
				<p className="mt-3 text-muted">This profile is private.</p>
			</div>
		);
	}

	const { user, isOwner, lists, stats } = data;
	const breakdown = KINDS.filter((k) => stats.counts[k]).map((k) => plural(stats.counts[k]!, KIND_LABELS[k].one, KIND_LABELS[k].many));

	return (
		<div>
			<PageHero>
				<header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
					<div className="halftone size-28 shrink-0 sm:size-32">
						{user.image ? (
							<img src={user.image} alt="" className="size-full border border-ink object-cover" />
						) : (
							<div className="grid size-full place-items-center border border-ink bg-paper-2 font-serif text-6xl">
								{user.username[0]?.toUpperCase()}
							</div>
						)}
					</div>
					<div className="min-w-0">
						<h1 className="font-serif text-[clamp(2.4rem,6vw,3.6rem)] leading-[0.95] tracking-tight [overflow-wrap:anywhere]">
							@{user.username}
						</h1>
						<p className="mt-2 text-[11px] text-muted">
							{user.name && <>{user.name} · </>}
							{plural(stats.items, "item")}
							{breakdown.length > 0 && <> ({breakdown.join(", ")})</>} · joined{" "}
							{new Date(user._creationTime).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
							{isOwner && user.isPrivate && (
								<>
									{" · "}
									<span className="bg-mark px-1 text-ink">private profile</span>
								</>
							)}
						</p>
					</div>
				</header>

				{user.bio && <p className="mt-6 font-serif text-xl leading-snug italic">{user.bio}</p>}
			</PageHero>

			<ControlStrip>
				<span className="label">{plural(stats.lists, "list")}</span>
				{isOwner && (
					<span className="flex gap-3">
						<NewListButton className="linkish">+ new list</NewListButton>
						<Link to="/settings">edit profile</Link>
					</span>
				)}
			</ControlStrip>

			<div className="mt-8">
				<ListRows lists={lists} empty={isOwner ? "You haven't made any lists yet." : "No public lists yet."} />
			</div>
		</div>
	);
}
