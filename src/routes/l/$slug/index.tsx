import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { KIND_LABELS, type Layout, LAYOUT_LABELS, LAYOUTS, LIMITS } from "@convex/shared/constants";
import { getTheme } from "@convex/shared/themes";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { AddItemDialog } from "@/components/add-item";
import { Art } from "@/components/art";
import { ListCover } from "@/components/list-cover";
import { Markdown, stripMarkdown } from "@/components/markdown";
import { ControlStrip, PageHero } from "@/components/page-hero";
import { cn, errorMessage, plural, siteUrl, timeAgo } from "@/lib/utils";

type Search = { view?: Layout; editing?: boolean };

export const Route = createFileRoute("/l/$slug/")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		view: LAYOUTS.includes(search.view as Layout) ? (search.view as Layout) : undefined,
		editing: search.editing === true || search.editing === "true" ? true : undefined,
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
	const editing = isOwner && search.editing === true;
	const theme = getTheme(list.theme);
	const themeVars = { "--theme-accent": theme.accent, "--theme-ink": theme.ink } as React.CSSProperties;
	// One kind of thing says so in the header; a mix tags each item with its kind instead.
	const kinds = new Set(items.map((i) => i.record.kind));
	const onlyKind = kinds.size === 1 ? KIND_LABELS[items[0].record.kind] : null;
	const mixed = kinds.size > 1;

	return (
		<article style={themeVars}>
			<PageHero>
				<header className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
					<ListCover
						theme={list.theme}
						seed={list.seed}
						emoji={list.emoji}
						framed
						className="w-28 sm:w-32"
						emojiClassName="text-[3.25rem]"
					/>
					<div className={cn("min-w-0", isOwner && "pr-12")}>
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
					{isOwner && (
						<Link
							to="/l/$slug/settings"
							params={{ slug }}
							className="btn btn-icon absolute top-0 right-0"
							aria-label="List settings"
							title="List settings"
						>
							<GearIcon />
						</Link>
					)}
				</header>

				{list.description && <Markdown text={list.description} className="prose-note mt-6 text-[14px]" />}

				{isOwner && (
					// The header fades out under a halftone while the items are being edited. Always mounted
					// so it can fade both ways.
					<div
						inert={!editing}
						className={cn(
							"group page-backdrop absolute inset-0 z-10 grid place-items-center p-5 transition-opacity duration-300 ease-out motion-reduce:transition-none",
							editing ? "opacity-100" : "pointer-events-none opacity-0",
						)}
						data-editing={editing || undefined}
					>
						<div aria-hidden className="page-backdrop-dots absolute inset-0" />
						<p className="relative translate-y-2 border border-edge bg-paper px-4 py-2 text-center text-[12px] transition-transform duration-300 ease-out group-data-editing:translate-y-0 motion-reduce:transition-none">
							<span className="font-bold">Editing Items.</span> Click or tap “done editing” to return.
						</p>
					</div>
				)}
			</PageHero>

			{/* While editing, the rest of the strip stays put but switches off, so "done editing" is the way back. */}
			<ControlStrip className={cn(editing && "sticky top-1.5 z-20 bg-paper")}>
				<label className={cn("flex items-center gap-3", editing && "opacity-50")}>
					<span className="label">View</span>
					<select
						className="field py-1 pl-2.5 text-[13px] leading-6 pointer-coarse:text-[16px]"
						value={layout}
						disabled={editing}
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
						{(items.length > 0 || editing) && (
							<Link
								to="."
								search={(prev) => ({ ...prev, editing: editing ? undefined : true })}
								replace
								resetScroll={false}
								className={cn("btn", editing && "btn-theme")}
							>
								{editing ? "done editing" : "edit items"}
							</Link>
						)}
						<button type="button" className="btn btn-theme" disabled={editing} onClick={() => setAdding(true)}>
							+ add
						</button>
					</span>
				)}
			</ControlStrip>

			{isOwner && (
				<AddItemDialog
					open={adding}
					onClose={() => setAdding(false)}
					listId={list._id}
					existing={new Set(items.map((i) => i.recordId))}
				/>
			)}

			{/* List — Large's first halftone band starts right under the control strip. */}
			<div className={cn(!(layout === "list-lg" && !editing && items.length > 0) && "mt-6")}>
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
				) : editing ? (
					<EditItems items={items} ranked={list.ranked} />
				) : layout === "grid-sm" || layout === "grid" || layout === "grid-lg" ? (
					<GridItems items={items} ranked={list.ranked} mixed={mixed} size={GRID_SIZES[layout]} />
				) : layout === "list-lg" ? (
					<JournalItems items={items} ranked={list.ranked} mixed={mixed} />
				) : layout === "minimal" ? (
					<CompactItems items={items} ranked={list.ranked} mixed={mixed} />
				) : (
					<ListItems items={items} ranked={list.ranked} mixed={mixed} />
				)}
			</div>
		</article>
	);
}

function GearIcon() {
	return (
		<svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
			<circle cx="12" cy="12" r="3" />
			<path d="m22,12h0c0-.757-.455-1.44-1.154-1.731l-1.164-.485c-.099-.343-.219-.678-.36-1.001-.198-.453-.192-.969-.004-1.426l.16-.389c.288-.7.127-1.504-.408-2.04h0c-.535-.535-1.34-.696-2.04-.408l-1.162.479c-.518-.287-1.073-.515-1.654-.682l-.485-1.164c-.291-.699-.974-1.154-1.731-1.154h0c-.757,0-1.44.455-1.731,1.154l-.485,1.164c-.581.167-1.135.395-1.654.682l-1.162-.479c-.7-.288-1.504-.127-2.040.408h0c-.535.535-.696,1.34-.408,2.04l.479,1.162c-.287.518-.515,1.073-.682,1.654l-1.164.485c-.699.291-1.154.974-1.154,1.731h0c0,.757.455,1.44,1.154,1.731l1.164.485c.167.581.395,1.135.682,1.654l-.479,1.162c-.288.7-.127,1.504.408,2.04h0c.535.535,1.34.696,2.040.408l1.162-.479c.518.287,1.073.515,1.654.682l.485,1.164c.291.699.974,1.154,1.731,1.154h0c.757,0,1.44-.455,1.731-1.154l.485-1.164c.581-.167,1.135-.395,1.654-.682l1.162.479c.7.288,1.504.127,2.04-.408h0c.535-.535.696-1.34.408-2.04l-.479-1.162c.287-.518.515-1.073.682-1.654l1.164-.485c.699-.291,1.154-.974,1.154-1.731Z" />
		</svg>
	);
}

function Rank({ n, className }: { n: number; className?: string }) {
	return (
		<span className={cn("tabular-nums", className)} aria-label={`Number ${n}`}>
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

// Art for the first few items loads right away instead of waiting to scroll into view.
const ABOVE_FOLD = 8;

function ListItems({ items, ranked, mixed }: { items: Item[]; ranked: boolean; mixed: boolean }) {
	return (
		<ol>
			{items.map((item, i) => (
				<li key={item._id} className="flex gap-4 border-b border-rule py-4 first:pt-0">
					{ranked && <Rank n={i + 1} className="w-9 shrink-0 text-right font-serif text-4xl leading-none" />}
					<Art
						image={item.record.image}
						kind={item.record.kind}
						alt=""
						sizes="(min-width: 640px) 80px, 64px"
						priority={i < ABOVE_FOLD}
						className="w-16 sm:w-20"
					/>
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

/**
 * One entry per row, like a blog: big art beside the title, with the note as the body of a review.
 * A band of halftone runs edge to edge behind the title, with the art hanging down out of it.
 */
function JournalItems({ items, ranked, mixed }: { items: Item[]; ranked: boolean; mixed: boolean }) {
	return (
		<ol>
			{items.map((item, i) => (
				// On wide screens the art spans both rows; the second row is 1fr so the art's height
				// doesn't stretch the band (the first row) past the title.
				<li
					key={item._id}
					className="relative isolate -mx-5 grid border-b border-rule pb-10 sm:-mx-8 sm:grid-cols-[auto_1fr] sm:grid-rows-[auto_1fr] sm:gap-x-8"
				>
					<div aria-hidden className="bg-halftone -z-10 col-span-full row-start-2 sm:row-start-1" />
					<Art
						image={item.record.image}
						kind={item.record.kind}
						alt=""
						sizes="(min-width: 640px) 200px, 140px"
						priority={i < 3}
						className="mx-5 mt-10 mb-5 w-36 sm:col-start-1 sm:row-span-2 sm:row-start-1 sm:mr-0 sm:mb-0 sm:ml-8 sm:w-50"
					/>
					<div className="row-start-2 min-w-0 px-5 pt-8 pb-10 sm:col-start-2 sm:row-start-1 sm:pt-14 sm:pr-8 sm:pl-0">
						<div className="flex items-center gap-4">
							{ranked && (
								<Rank n={i + 1} className="grid min-w-11 shrink-0 place-items-center border border-edge bg-paper px-1.5 text-[18px] leading-11" />
							)}
							<h2 className="min-w-0 font-serif text-[clamp(1.9rem,4vw,2.6rem)] leading-[1.05] tracking-tight [overflow-wrap:anywhere]">
								<Title record={item.record} />
							</h2>
						</div>
						<p className="mt-1.5 text-[12px]">
							<Meta record={item.record} mixed={mixed} />
						</p>
					</div>
					{item.note ? (
						<Markdown
							text={item.note}
							className="prose-note row-start-3 min-w-0 px-5 pt-6 text-[14px] leading-relaxed sm:col-start-2 sm:row-start-2 sm:pr-8 sm:pl-0"
						/>
					) : (
						<p className="row-start-3 px-5 pt-6 text-[13px] text-muted italic opacity-70 sm:col-start-2 sm:row-start-2 sm:pr-8 sm:pl-0">
							No note added
						</p>
					)}
				</li>
			))}
		</ol>
	);
}

// Columns, gaps, text and rank badge for each grid size. Column counts hold at every width, so art
// shrinks with the screen instead of growing as columns drop; only the gaps tighten on mobile.
// `sizes` is how wide art renders: a share of the screen, capped once the layout column stops
// growing (about 1090px wide at 1152px).
const GRID_SIZES = {
	"grid-sm": {
		grid: "grid-cols-7 gap-x-2 gap-y-6 sm:gap-x-5 sm:gap-y-8",
		sizes: "(min-width: 1152px) 140px, 13vw",
		title: "text-[12px]",
		meta: "text-[10px]",
		rank: "-top-2 -left-2 min-w-8 text-[14px] leading-8",
	},
	grid: {
		grid: "grid-cols-5 gap-x-3 gap-y-8 sm:gap-x-7 sm:gap-y-10",
		sizes: "(min-width: 1152px) 200px, 18vw",
		title: "",
		meta: "text-[11px]",
		rank: "-top-2.5 -left-2.5 min-w-11 text-[18px] leading-11",
	},
	"grid-lg": {
		grid: "grid-cols-3 gap-x-4 gap-y-10 sm:gap-x-10 sm:gap-y-12",
		sizes: "(min-width: 1152px) 340px, 31vw",
		title: "text-[15px]",
		meta: "text-[12px]",
		rank: "-top-3 -left-3 min-w-14 text-[24px] leading-14",
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
						<Art
							image={item.record.image}
							kind={item.record.kind}
							alt={item.record.title}
							sizes={size.sizes}
							priority={i < ABOVE_FOLD}
							className="w-full"
						/>
						{ranked && (
							<Rank n={i + 1} className={cn("absolute grid place-items-center border border-edge bg-paper px-1.5", size.rank)} />
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

function EditItems({ items, ranked }: { items: Item[]; ranked: boolean }) {
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
					{ranked && <span className="w-6 pt-0.5 text-right font-mono text-[11px] text-muted">{i + 1}</span>}
					<Art image={item.record.image} kind={item.record.kind} alt="" sizes="40px" className="w-10" />
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
									className="field font-serif text-[1.05rem] italic pointer-coarse:text-[16px]"
									rows={6}
									maxLength={LIMITS.itemNote}
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
