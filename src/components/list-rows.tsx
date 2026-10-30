import type { Image } from "@convex/shared/images";
import { Link } from "@tanstack/react-router";
import { Art } from "@/components/art";
import { ListCover } from "@/components/list-cover";
import { stripMarkdown } from "@/components/markdown";
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
	covers: { image: Image; kind: string; title: string }[];
	owner?: { username: string } | null;
};

/**
 * Lists as rows: the cover, what it is, and a peek at the art of its first items,
 * standing on a shared baseline like a shelf.
 */
export function ListRows({ lists, empty }: { lists: Row[]; empty?: React.ReactNode }) {
	if (lists.length === 0) return <p className="text-muted">{empty ?? "No lists yet."}</p>;
	return (
		<ol>
			{lists.map((list) => {
				const more = list.itemCount - list.covers.length;
				return (
					<li
						key={list._id}
						className="flex flex-wrap items-center gap-x-7 gap-y-4 border-b border-rule py-6 first:pt-0 md:flex-nowrap"
					>
						<Link to="/l/$slug" params={{ slug: list.slug }} className="plain shrink-0" tabIndex={-1}>
							<ListCover
								theme={list.theme}
								seed={list.seed}
								emoji={list.emoji}
								framed
								className="w-20 sm:w-24"
								emojiClassName="text-[2.5rem]"
							/>
						</Link>
						<div className="min-w-0 flex-1">
							<Link
								to="/l/$slug"
								params={{ slug: list.slug }}
								className="plain font-serif text-[1.9rem] leading-[1.05] tracking-tight hover:underline"
							>
								{list.name}
							</Link>
							<p className="mt-1.5 text-[11px] text-muted">
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
								{list.visibility !== "public" && (
									<>
										{" · "}
										<span className="bg-mark px-1 text-ink">{list.visibility}</span>
									</>
								)}
							</p>
							{list.description && (
								<p className="mt-2 line-clamp-1 text-[13px]">{stripMarkdown(list.description)}</p>
							)}
						</div>
						{list.covers.length > 0 && (
							<Link
								to="/l/$slug"
								params={{ slug: list.slug }}
								className="plain flex w-full shrink-0 items-end gap-2 md:w-auto"
								aria-label={`What's on ${list.name}`}
							>
								{list.covers.map((cover, i) => (
									<Art
										key={i}
										image={cover.image}
										kind={cover.kind}
										alt={cover.title}
										sizes="(min-width: 1024px) 56px, 44px"
										// Posters and albums share a width, so albums sit shorter on the shelf.
										// They may shrink so six still fit on the narrowest phones.
										className="w-11 min-w-0 shrink lg:w-14"
									/>
								))}
								{more > 0 && <span className="pb-0.5 pl-1 text-[11px] whitespace-nowrap text-muted">+{more}</span>}
							</Link>
						)}
					</li>
				);
			})}
		</ol>
	);
}
