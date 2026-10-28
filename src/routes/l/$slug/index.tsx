import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { KIND_LABELS, type Layout, LAYOUT_LABELS, LAYOUTS } from "@convex/shared/constants";
import { getTheme } from "@convex/shared/themes";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { AddItem } from "@/components/add-item";
import { Art } from "@/components/art";
import { ListCover } from "@/components/list-cover";
import { Markdown, stripMarkdown } from "@/components/markdown";
import { ControlStrip, PageHero } from "@/components/page-hero";
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
	const navigate = Route.useNavigate();
	const { data } = useSuspenseQuery(convexQuery(api.lists.get, { slug }));
	const [adding, setAdding] = useState(false);
	if (!data) return null;

	const { list, owner, isOwner, items } = data;
	const layout = search.view ?? list.layout;
	const arrange = isOwner && search.arrange === true;
	const theme = getTheme(list.theme);
	// One kind of thing says so in the header; a mix tags each item with its kind instead.
	const kinds = new Set(items.map((i) => i.record.kind));
	const onlyKind = kinds.size === 1 ? KIND_LABELS[items[0].record.kind] : null;
	const mixed = kinds.size > 1;

	return (
		<article>
			<PageHero>
				<header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
					<ListCover
						theme={list.theme}
						seed={list.seed}
						emoji={list.emoji}
						framed
						className="w-28 sm:w-32"
						emojiClassName="text-[3.25rem]"
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
							{onlyKind ? plural(items.length, onlyKind.one, onlyKind.many) : plural(items.length, "item")}
							{mixed && " · mixed"} · updated {timeAgo(list.updatedAt)}
							{list.visibility !== "public" && (
								<>
									{" · "}
									<span className="bg-mark px-1 text-ink">{list.visibility}</span>
								</>
							)}
						</p>
					</div>
				</header>

				{list.description && <Markdown text={list.description} className="prose-note mt-6 text-[14px]" />}
			</PageHero>

			<ControlStrip>
				<label className="flex items-center gap-3">
					<span className="label">View</span>
					<select
						className="field py-1 pl-2.5 text-[13px] leading-6"
						value={layout}
						onChange={(e) => {
							const view = e.target.value as Layout;
							void navigate({
								search: (prev) => ({ ...prev, view: view === list.layout ? undefined : view }),
								replace: true,
								resetScroll: false,
							});
						}}
					>
						{LAYOUTS.map((l) => (
							<option key={l} value={l}>
								{LAYOUT_LABELS[l]}
							</option>
						))}
					</select>
				</label>
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
			</ControlStrip>

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
				) : layout === "grid-sm" || layout === "grid" || layout === "grid-lg" ? (
					<GridItems items={items} ranked={list.ranked} mixed={mixed} size={GRID_SIZES[layout]} />
				) : layout === "compact" ? (
					<CompactItems items={items} ranked={list.ranked} mixed={mixed} />
				) : (
					<ListItems items={items} ranked={list.ranked} mixed={mixed} />
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

/** Year and creators, led by the kind of thing when the list mixes kinds. */
function Meta({ record, mixed }: { record: Doc<"records">; mixed: boolean }) {
	const parts = [mixed && KIND_LABELS[record.kind].one, record.year, record.creators.join(", ")].filter(Boolean);
	return <span className="text-muted">{parts.join(" · ")}</span>;
}

function Title({ record }: { record: Doc<"records"> }) {
	const text = record.subtitle && record.kind === "book" ? `${record.title}: ${record.subtitle}` : record.title;
	return (
		<Link to="/$kind/$id" params={{ kind: record.kind, id: record.sourceId }} className="plain hover:underline">
			{text}
		</Link>
	);
}

function ListItems({ items, ranked, mixed }: { items: Item[]; ranked: boolean; mixed: boolean }) {
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
							<Meta record={item.record} mixed={mixed} />
						</p>
						{item.note && <Markdown text={item.note} className="prose-note mt-2 font-serif text-[1.15rem] leading-snug italic" />}
					</div>
				</li>
			))}
		</ol>
	);
}

function CompactItems({ items, ranked, mixed }: { items: Item[]; ranked: boolean; mixed: boolean }) {
	return (
		<ol className="font-mono text-[12px]">
			{items.map((item, i) => (
				<li key={item._id} className="flex gap-3 border-b border-dotted border-rule py-2 first:pt-0">
					{ranked && <span className="w-7 shrink-0 text-right text-muted">{`${String(i + 1).padStart(2, "0")}.`}</span>}
					<span className="min-w-0 flex-1 truncate">
						<span className="font-bold">
							<Title record={item.record} />
						</span>{" "}
						{item.record.year && <span className="text-muted">({item.record.year})</span>}
					</span>
					<span className="hidden max-w-[40%] truncate text-muted sm:inline">{item.record.creators.join(", ")}</span>
					{mixed && (
						<span className="shrink-0 text-muted">
							{item.record.creators.length > 0 && <span className="hidden sm:inline">· </span>}
							<span className="inline-block w-[5ch]">{KIND_LABELS[item.record.kind].one}</span>
						</span>
					)}
				</li>
			))}
		</ol>
	);
}

// Columns, gaps, text and rank badge for each grid size.
const GRID_SIZES = {
	"grid-sm": {
		grid: "grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-5 sm:gap-x-5 lg:grid-cols-7",
		title: "text-[12px]",
		meta: "text-[10px]",
		rank: "-top-1.5 -left-1.5 min-w-6 text-base leading-6",
	},
	grid: {
		grid: "grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-7 lg:grid-cols-5",
		title: "",
		meta: "text-[11px]",
		rank: "-top-2 -left-2 min-w-8 text-xl leading-7",
	},
	"grid-lg": {
		grid: "grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-3",
		title: "text-[15px]",
		meta: "text-[12px]",
		rank: "-top-2.5 -left-2.5 min-w-10 text-3xl leading-9",
	},
};

type GridSize = (typeof GRID_SIZES)[keyof typeof GRID_SIZES];

function GridItems({ items, ranked, mixed, size }: { items: Item[]; ranked: boolean; mixed: boolean; size: GridSize }) {
	return (
		<ol className={cn("grid", size.grid)}>
			{items.map((item, i) => (
				// The text sits at the bottom of its cell, so titles in a row line up even under shorter (square) art;
				// any gap that leaves is filled with a faint halftone (none when the art fills the cell).
				<li key={item._id} className="flex min-w-0 flex-col">
					<div className="relative">
						<Art src={item.record.image} kind={item.record.kind} alt={item.record.title} className="w-full" />
						{ranked && (
							<Rank n={i + 1} className={cn("absolute grid place-items-center border border-ink bg-paper px-1", size.rank)} />
						)}
					</div>
					<div aria-hidden className="relative flex-1">
						<div className="halftone-fill absolute inset-x-0 top-2 bottom-0" />
					</div>
					<div className="pt-2">
						<p className={cn("truncate font-bold", size.title)}>
							<Title record={item.record} />
						</p>
						<p className={cn("truncate", size.meta)}>
							<Meta record={item.record} mixed={mixed} />
						</p>
					</div>
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
