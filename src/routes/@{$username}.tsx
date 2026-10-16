import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { KIND_LABELS, KINDS } from "@convex/shared/constants";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ListRows } from "@/components/list-rows";
import { NewListButton } from "@/components/new-list-button";
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
			<header className="flex items-center gap-5">
				<div className="halftone halftone-sm size-20 shrink-0">
					{user.image ? (
						<img src={user.image} alt="" className="size-full border border-ink object-cover" />
					) : (
						<div className="grid size-full place-items-center border border-ink bg-paper-2 font-serif text-4xl">
							{user.username[0]?.toUpperCase()}
						</div>
					)}
				</div>
				<div className="min-w-0">
					<h1 className="font-serif text-5xl leading-none">@{user.username}</h1>
					{user.name && <p className="mt-1 text-muted">{user.name}</p>}
				</div>
			</header>

			{user.bio && <p className="mt-5 max-w-[32rem] font-serif text-xl leading-snug italic">{user.bio}</p>}

			<p className="mt-5 text-[12px] text-muted">
				{plural(stats.lists, "list")} · {plural(stats.items, "item")}
				{breakdown.length > 0 && <> ({breakdown.join(", ")})</>} · joined{" "}
				{new Date(user._creationTime).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
				{isOwner && (
					<>
						{" · "}
						<Link to="/settings">edit profile</Link>
						{user.isPrivate && <span className="ml-2 bg-mark px-1 text-ink">private profile</span>}
					</>
				)}
			</p>

			<section className="mt-10">
				<div className="mb-2 flex items-baseline justify-between">
					<h2 className="label">Lists</h2>
					{isOwner && <NewListButton className="linkish text-[12px]">+ new list</NewListButton>}
				</div>
				<ListRows lists={lists} empty={isOwner ? "You haven't made any lists yet." : "No public lists yet."} />
			</section>
		</div>
	);
}
