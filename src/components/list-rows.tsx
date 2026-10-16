import { Link } from "@tanstack/react-router";
import { Art } from "@/components/art";
import { ListCover } from "@/components/list-cover";
import { plural, timeAgo } from "@/lib/utils";

type Row = {
	_id: string;
	slug: string;
	name: string;
	emoji?: string;
	theme: string;
	seed: number;
	itemCount: number;
	updatedAt: number;
	visibility: string;
	description?: string;
	covers: { image: string; kind: string }[];
	owner?: { username: string } | null;
};

export function ListRows({ lists, empty }: { lists: Row[]; empty?: React.ReactNode }) {
	if (lists.length === 0) return <p className="text-muted">{empty ?? "No lists yet."}</p>;
	return (
		<ol className="border-t border-rule">
			{lists.map((list) => (
				<li key={list._id} className="flex items-center gap-4 border-b border-rule py-3">
					<Link to="/l/$slug" params={{ slug: list.slug }} className="plain" tabIndex={-1}>
						<ListCover
							theme={list.theme}
							seed={list.seed}
							emoji={list.emoji}
							className="w-14"
							emojiClassName="text-2xl"
						/>
					</Link>
					<div className="min-w-0 flex-1">
						<Link
							to="/l/$slug"
							params={{ slug: list.slug }}
							className="font-serif text-[1.45rem] leading-tight"
						>
							{list.name}
						</Link>
						<p className="mt-0.5 text-[11px] text-muted">
							{plural(list.itemCount, "item")}
							{list.owner && (
								<>
									{" · by "}
									<Link to="/@{$username}" params={{ username: list.owner.username }}>
										@{list.owner.username}
									</Link>
								</>
							)}
							{" · updated "}
							{timeAgo(list.updatedAt)}
							{list.visibility !== "public" && <> · <span className="bg-mark px-1 text-ink">{list.visibility}</span></>}
						</p>
					</div>
					<div className="hidden shrink-0 items-center gap-1 sm:flex">
						{list.covers.slice(0, 4).map((cover, i) => (
							<Art key={i} src={cover.image} kind={cover.kind} alt="" className="aspect-square w-9" />
						))}
					</div>
				</li>
			))}
		</ol>
	);
}
