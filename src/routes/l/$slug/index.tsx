import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { type Layout, LAYOUTS } from "@convex/shared/constants";
import { getTheme, meshGradient } from "@convex/shared/themes";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { AddItem } from "@/components/add-item";
import { Art } from "@/components/art";
import { ListCover } from "@/components/list-cover";
import { Markdown, stripMarkdown } from "@/components/markdown";
import { cn, errorMessage, plural, siteUrl, timeAgo } from "@/lib/utils";

type Search = { view?: Layout; arrange?: boolean };

export const Route = createFileRoute("/l/$slug/")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		view: LAYOUTS.includes(search.view as Layout) ? (search.view as Layout) : undefined,
		arrange: search.arrange === true || search.arrange === "true" ? true : undefined,
	}),
	loader: async ({ context, params }) => {
		const data = await context.queryClient.ensureQueryData(
			convexQuery(api.lists.get, { slug: params.slug }),
		);
		if (!data) throw notFound();
		return {
			name: data.list.name,
			emoji: data.list.emoji,
			description: data.list.description,
			owner: data.owner?.username,
			updatedAt: data.list.updatedAt,
			unlisted: data.list.visibility !== "public",
		};
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return {};
		const title = `${loaderData.emoji ? `${loaderData.emoji} ` : ""}${loaderData.name}`;
		const description = loaderData.description
			? stripMarkdown(loaderData.description).slice(0, 200)
			: `A list by @${loaderData.owner} on onda.`;
		const image = `${siteUrl}/og/l/${params.slug}.png?v=${loaderData.updatedAt}`;
		return {
			meta: [
				{ title: `${title} · onda` },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:image", content: image },
				{ property: "og:image:width", content: "1200" },
				{ property: "og:image:height", content: "630" },
				{ name: "twitter:image", content: image },
				...(loaderData.unlisted ? [{ name: "robots", content: "noindex" }] : []),
			],
		};
	},
	component: ListPage,
});

type Item = Doc<"items"> & { record: Doc<"records"> };

function ListPage() {
	const { slug } = Route.useParams();
	const search = Route.useSearch();
	const { data } = useSuspenseQuery(convexQuery(api.lists.get, { slug }));
	const [adding, setAdding] = useState(false);
	if (!data) return null;

	const { list, owner, isOwner, items } = data;
	const layout = search.view ?? list.layout;
	const arrange = isOwner && search.arrange === true;
	const theme = getTheme(list.theme);

	return (
		<article>
			{/* A sliver of the list's gradient across the top of the window. */}
			<div className="fixed inset-x-0 top-0 h-1.5" style={meshGradient(list.theme, list.seed)} />

			<header className="flex flex-col gap-5 sm:flex-row sm:items-end">
				<ListCover
					theme={list.theme}
					seed={list.seed}
					emoji={list.emoji}
					className="w-36 border border-ink shadow-[4px_4px_0_var(--ink)] sm:w-44"
					emojiClassName="text-6xl"
				/>
				<div className="min-w-0">
					<h1 className="font-serif text-[clamp(2.4rem,6vw,3.6rem)] leading-[0.95] tracking-tight [overflow-wrap:anywhere]">
						{list.name}
					</h1>
					<p className="mt-2 text-[11px] text-muted">
						{owner && (
							<>
								by{" "}
								<Link to="/@{$username}" params={{ username: owner.username }}>
									@{owner.username}
								</Link>
								{" · "}
							</>
						)}
						{plural(items.length, "item")} · updated {timeAgo(list.updatedAt)}
						{list.visibility !== "public" && (
							<>
								{" · "}
								<span className="bg-mark px-1 text-ink">{list.visibility}</span>
							</>
						)}
					</p>
				</div>
			</header>

			{list.description && <Markdown text={list.description} className="prose-note mt-6 max-w-[36rem] text-[14px]" />}

			<nav className="mt-8 flex flex-wrap items-baseline justify-between gap-3 border-y border-rule py-2 text-[12px]">
				<span className="flex gap-3">
					<span className="label">View</span>
					{LAYOUTS.map((l) => (
						<Link
							key={l}
							to="."
							search={(prev) => ({ ...prev, view: l === list.layout ? undefined : l })}
							replace
							resetScroll={false}
							className={cn(l === layout && "bg-ink px-1 text-paper no-underline visited:text-paper")}
						>
							{l}
						</Link>
					))}
				</span>
				{isOwner && (
					<span className="flex gap-3">
						<button type="button" className="linkish" onClick={() => setAdding((a) => !a)}>
							{adding ? "done adding" : "+ add"}
						</button>
						<Link to="." search={(prev) => ({ ...prev, arrange: arrange ? undefined : true })} replace resetScroll={false}>
							{arrange ? "done arranging" : "arrange"}
						</Link>
						<Link to="/l/$slug/edit" params={{ slug }}>
							edit list
						</Link>
					</span>
				)}
			</nav>

			{adding && (
				<div className="mt-5">
					<AddItem listId={list._id} existing={new Set(items.map((i) => i.recordId))} />
				</div>
			)}

			<div className="mt-6" style={{ "--accent": theme.colors[0] } as React.CSSProperties}>
				{items.length === 0 ? (
					<p className="py-10 text-muted">
						{isOwner ? (
							<>
								Empty for now.{" "}
								<button type="button" className="linkish" onClick={() => setAdding(true)}>
									Add the first thing
								</button>
								.
							</>
						) : (
							"Nothing on this list yet."
						)}
					</p>
				) : arrange ? (
					<ArrangeItems items={items} ranked={list.ranked} />
				) : layout === "grid" ? (
					<GridItems items={items} ranked={list.ranked} />
				) : layout === "compact" ? (
					<CompactItems items={items} ranked={list.ranked} />
				) : (
					<ListItems items={items} ranked={list.ranked} />
				)}
			</div>
		</article>
	);
}

function Rank({ n, className }: { n: number; className?: string }) {
	return (
		<span className={cn("font-serif tabular-nums", className)} aria-label={`Number ${n}`}>
			{n}
		</span>
	);
}

function Meta({ record }: { record: Doc<"records"> }) {
	const parts = [record.year, record.creators.join(", ")].filter(Boolean);
	return <span className="text-muted">{parts.join(" · ")}</span>;
}

function Title({ record }: { record: Doc<"records"> }) {
	const text = record.subtitle && record.kind === "book" ? `${record.title}: ${record.subtitle}` : record.title;
	return record.url ? (
		<a href={record.url} target="_blank" rel="noopener noreferrer" className="plain hover:underline">
			{text}
		</a>
	) : (
		<>{text}</>
	);
}

function ListItems({ items, ranked }: { items: Item[]; ranked: boolean }) {
	return (
		<ol>
			{items.map((item, i) => (
				<li key={item._id} className="flex gap-4 border-b border-rule py-4 first:pt-0">
					{ranked && <Rank n={i + 1} className="w-9 shrink-0 text-right text-4xl leading-none" />}
					<Art src={item.record.image} kind={item.record.kind} alt="" className="w-16 sm:w-20" />
					<div className="min-w-0 flex-1">
						<p className="text-[15px] font-bold leading-snug">
							<Title record={item.record} />
						</p>
						<p className="text-[12px]">
							<Meta record={item.record} />
						</p>
						{item.note && <Markdown text={item.note} className="prose-note mt-2 font-serif text-[1.15rem] leading-snug italic" />}
					</div>
				</li>
			))}
		</ol>
	);
}

function CompactItems({ items, ranked }: { items: Item[]; ranked: boolean }) {
	return (
		<ol className="font-mono text-[12px]">
			{items.map((item, i) => (
				<li key={item._id} className="flex gap-3 border-b border-dotted border-rule py-1.5">
					<span className="w-7 shrink-0 text-right text-muted">{ranked ? `${String(i + 1).padStart(2, "0")}.` : "·"}</span>
					<span className="min-w-0 flex-1 truncate">
						<span className="font-bold">
							<Title record={item.record} />
						</span>{" "}
						{item.record.year && <span className="text-muted">({item.record.year})</span>}
					</span>
					<span className="hidden max-w-[40%] truncate text-muted sm:inline">{item.record.creators.join(", ")}</span>
				</li>
			))}
		</ol>
	);
}

function GridItems({ items, ranked }: { items: Item[]; ranked: boolean }) {
	return (
		<ol className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
			{items.map((item, i) => (
				<li key={item._id} className="min-w-0">
					<div className="relative">
						<Art src={item.record.image} kind={item.record.kind} alt={item.record.title} className="w-full" />
						{ranked && (
							<Rank n={i + 1} className="absolute -top-2 -left-2 grid min-w-8 place-items-center border border-ink bg-paper px-1 text-xl leading-7" />
						)}
					</div>
					<p className="mt-2 truncate font-bold">
						<Title record={item.record} />
					</p>
					<p className="truncate text-[11px]">
						<Meta record={item.record} />
					</p>
				</li>
			))}
		</ol>
	);
}

function ArrangeItems({ items, ranked }: { items: Item[]; ranked: boolean }) {
	const move = useMutation(api.items.move);
	const remove = useMutation(api.items.remove);
	const setNote = useMutation(api.items.setNote);
	const [editing, setEditing] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [dragging, setDragging] = useState<number | null>(null);
	const [over, setOver] = useState<number | null>(null);

	const run = (p: Promise<unknown>) => p.catch((e) => alert(errorMessage(e)));

	return (
		<ol>
			{items.map((item, i) => (
				<li
					key={item._id}
					draggable={editing !== item._id}
					onDragStart={() => setDragging(i)}
					onDragOver={(e) => {
						e.preventDefault();
						setOver(i);
					}}
					onDragEnd={() => {
						setDragging(null);
						setOver(null);
					}}
					onDrop={() => {
						if (dragging !== null && dragging !== i) void run(move({ itemId: items[dragging]!._id, toIndex: i }));
						setDragging(null);
						setOver(null);
					}}
					className={cn(
						"flex items-start gap-3 border-b border-rule py-2.5",
						dragging === i && "opacity-40",
						over === i && dragging !== null && dragging !== i && "bg-mark",
					)}
				>
					<span className="cursor-grab pt-1 font-mono text-muted select-none" title="Drag to reorder">
						⠿
					</span>
					<span className="w-6 pt-0.5 text-right font-mono text-[11px] text-muted">{ranked ? i + 1 : ""}</span>
					<Art src={item.record.image} kind={item.record.kind} alt="" className="w-10" />
					<div className="min-w-0 flex-1">
						<p className="truncate font-bold">{item.record.title}</p>
						{editing === item._id ? (
							<form
								className="mt-1"
								onSubmit={async (e) => {
									e.preventDefault();
									await run(setNote({ itemId: item._id, note: draft }));
									setEditing(null);
								}}
							>
								<textarea
									className="field font-serif text-[1.05rem] italic"
									rows={3}
									maxLength={500}
									value={draft}
									onChange={(e) => setDraft(e.target.value)}
									placeholder="A note about this one…"
								/>
								<div className="mt-1 flex gap-2">
									<button type="submit" className="btn btn-primary">
										save note
									</button>
									<button type="button" className="btn" onClick={() => setEditing(null)}>
										cancel
									</button>
								</div>
							</form>
						) : (
							<p className="truncate text-[12px] text-muted">{item.note ? `“${item.note}”` : "no note"}</p>
						)}
					</div>
					<span className="flex shrink-0 gap-2 pt-0.5 text-[12px]">
						<button type="button" className="linkish" disabled={i === 0} onClick={() => run(move({ itemId: item._id, toIndex: i - 1 }))} aria-label="Move up">
							↑
						</button>
						<button
							type="button"
							className="linkish"
							disabled={i === items.length - 1}
							onClick={() => run(move({ itemId: item._id, toIndex: i + 1 }))}
							aria-label="Move down"
						>
							↓
						</button>
						<button
							type="button"
							className="linkish"
							onClick={() => {
								setEditing(item._id);
								setDraft(item.note ?? "");
							}}
						>
							note
						</button>
						<button
							type="button"
							className="linkish text-danger"
							onClick={() => {
								if (confirm(`Remove “${item.record.title}”?`)) void run(remove({ itemId: item._id }));
							}}
						>
							remove
						</button>
					</span>
				</li>
			))}
		</ol>
	);
}
