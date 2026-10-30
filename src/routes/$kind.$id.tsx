import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { KIND_LABELS, KINDS, type Kind, LOCALIZED_KINDS, SOURCE_LABELS } from "@convex/shared/constants";
import { imageUrl } from "@convex/shared/images";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { Art } from "@/components/art";
import { ListCover } from "@/components/list-cover";
import { errorMessage, plural } from "@/lib/utils";

const DETAILS_TTL = 30 * 24 * 60 * 60 * 1000;
// The cover is w-36, sm:w-44.
const COVER_SIZES = "(min-width: 640px) 176px, 144px";

export const Route = createFileRoute("/$kind/$id")({
	params: {
		parse: ({ kind, id }) => {
			if (!KINDS.includes(kind as Kind)) throw notFound();
			return { kind: kind as Kind, id };
		},
		stringify: ({ kind, id }) => ({ kind, id }),
	},
	// Experimental: `?lang=es` is the Spanish record, added with the add dialog's language select.
	validateSearch: (search: Record<string, unknown>): { lang?: "es" } => (search.lang === "es" ? { lang: "es" } : {}),
	loaderDeps: ({ search }) => ({ lang: search.lang }),
	loader: async ({ context, params, deps }) => {
		const { record } = await context.queryClient.ensureQueryData(
			convexQuery(api.records.page, { kind: params.kind, sourceId: params.id, language: deps.lang }),
		);
		return (
			record && {
				title: record.title,
				year: record.year,
				description: record.description,
				image: imageUrl(record.image, 500),
			}
		);
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return { meta: [{ title: `${KIND_LABELS[params.kind].one} · onda` }] };
		const title = `${loaderData.title}${loaderData.year ? ` (${loaderData.year})` : ""}`;
		return {
			meta: [
				{ title: `${title} · onda` },
				{ property: "og:title", content: title },
				...(loaderData.description
					? [
							{ name: "description", content: loaderData.description.slice(0, 200) },
							{ property: "og:description", content: loaderData.description.slice(0, 200) },
						]
					: []),
				...(loaderData.image
					? [
							{ property: "og:image", content: loaderData.image },
							{ name: "twitter:card", content: "summary" },
						]
					: []),
			],
		};
	},
	component: ItemPage,
});

function ItemPage() {
	const { kind, id } = Route.useParams();
	const { lang } = Route.useSearch();
	const { data } = useSuspenseQuery(convexQuery(api.records.page, { kind, sourceId: id, language: lang }));
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	const ensureDetails = useAction(api.records.ensureDetails);
	const [status, setStatus] = useState<"idle" | "fetching" | "missing" | "error">("idle");

	const record = data.record;
	const stale = !record?.detailsFetchedAt || Date.now() - record.detailsFetchedAt > DETAILS_TTL;

	// First visit (or a stale cache) pulls full details from the source once;
	// the page then updates reactively from Convex.
	useEffect(() => {
		if (!stale) return;
		let cancelled = false;
		setStatus("fetching");
		ensureDetails({ kind, sourceId: id, language: lang })
			.then((result) => !cancelled && setStatus(result === "missing" ? "missing" : "idle"))
			.catch(() => !cancelled && setStatus("error"));
		return () => {
			cancelled = true;
		};
	}, [kind, id, lang, stale, ensureDetails]);

	if (!record) {
		if (status === "missing") {
			return (
				<div className="py-10">
					<h1 className="font-serif text-5xl">Not found.</h1>
					<p className="mt-3 text-muted">We couldn't find that {KIND_LABELS[kind].one}.</p>
				</div>
			);
		}
		return (
			<p className="py-10 text-muted">
				{status === "error" ? "The source isn't responding right now. Try again in a bit." : "Looking it up…"}
			</p>
		);
	}

	// Experimental: Spanish pages can always go back to English; English pages offer Spanish
	// once it exists or to people with the language selector on.
	const canChangeLanguage =
		LOCALIZED_KINDS.includes(kind) && (lang === "es" || data.hasOtherLanguage || viewer?.languageSelector === true);

	return (
		<article className="relative">
			{canChangeLanguage && (
				<p className="absolute top-0 right-0 text-[12px] text-muted">
					{lang ? "Cambiar idioma" : "Change language"}:{" "}
					<Link to="/$kind/$id" params={{ kind, id }} search={lang ? {} : { lang: "es" }}>
						{lang ? "EN" : "ES"}
					</Link>
				</p>
			)}
			<header className="flex flex-col gap-6 sm:flex-row sm:items-end">
				<div className="halftone w-36 shrink-0 sm:w-44">
					<Art
						image={record.image}
						kind={record.kind}
						alt={record.title}
						sizes={COVER_SIZES}
						priority
						className="w-full border-ink"
					/>
				</div>
				<div className="min-w-0">
					<p className="label">
						{KIND_LABELS[record.kind].one}
						{record.year && <> · {record.year}</>}
					</p>
					<h1 className="mt-1 font-serif text-[clamp(2.4rem,6vw,3.6rem)] leading-[0.95] tracking-tight [overflow-wrap:anywhere]">
						{record.title}
					</h1>
					{record.subtitle && record.kind === "book" && (
						<p className="mt-1 font-serif text-xl text-muted italic">{record.subtitle}</p>
					)}
					{record.creators.length > 0 && <p className="mt-2 text-[14px]">by {record.creators.join(", ")}</p>}
				</div>
			</header>

			{record.genres && record.genres.length > 0 && (
				<ul className="mt-6 flex flex-wrap gap-1.5">
					{record.genres.map((genre) => (
						<li key={genre} className="border border-rule px-1.5 text-[11px] text-muted">
							{genre}
						</li>
					))}
				</ul>
			)}

			{record.description ? (
				<div className="mt-6 space-y-3 text-[14px]">
					{record.description.split(/\n{2,}/).map((para, i) => (
						<p key={i}>{para}</p>
					))}
				</div>
			) : (
				status === "fetching" && <p className="mt-6 text-muted">Fetching details…</p>
			)}

			{record.facts && record.facts.length > 0 && (
				<dl className="mt-6 grid grid-cols-[8rem_1fr] border-t border-rule text-[12px]">
					{record.facts.map((fact) => (
						<div key={fact.label} className="contents">
							<dt className="border-b border-rule py-1.5 text-muted">{fact.label}</dt>
							<dd className="border-b border-rule py-1.5">{fact.value}</dd>
						</div>
					))}
				</dl>
			)}

			{record.url && (
				<p className="mt-5 text-[12px]">
					<a href={record.url} target="_blank" rel="noopener noreferrer">
						View on {SOURCE_LABELS[record.source]} ↗
					</a>
				</p>
			)}

			<AddToList record={record} />

			<section className="mt-12">
				<h2 className="label mb-2">On {plural(data.lists.length, "public list")}</h2>
				{data.lists.length === 0 ? (
					<p className="text-muted">Not on any public lists yet.</p>
				) : (
					<ol className="border-t border-rule">
						{data.lists.map((list) => (
							<li key={list._id} className="flex items-center gap-3 border-b border-rule py-2">
								<ListCover theme={list.theme} seed={list.seed} emoji={list.emoji} className="w-9" emojiClassName="text-lg" />
								<div className="min-w-0 flex-1">
									<Link to="/@{$username}/l/$slug" params={{ username: list.owner, slug: list.slug }} className="font-serif text-lg leading-tight">
										{list.name}
									</Link>
									<p className="text-[11px] text-muted">
										by{" "}
										<Link to="/@{$username}" params={{ username: list.owner }}>
											@{list.owner}
										</Link>{" "}
										· {plural(list.itemCount, "item")}
									</p>
								</div>
								{list.rank && <span className="font-serif text-2xl tabular-nums">#{list.rank}</span>}
							</li>
						))}
					</ol>
				)}
			</section>
		</article>
	);
}

function AddToList({ record }: { record: Doc<"records"> }) {
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	const { data: lists } = useQuery({ ...convexQuery(api.lists.mine, { recordId: record._id }), enabled: !!viewer });
	const add = useMutation(api.items.add);
	const [listId, setListId] = useState<Id<"lists"> | "">("");
	const [message, setMessage] = useState<string | null>(null);

	if (!viewer || !lists || lists.length === 0) return null;
	const available = lists.filter((l) => !l.has);

	return (
		<form
			className="-mx-5 mt-8 flex flex-wrap items-center gap-2 border-y border-rule px-5 py-3 text-[12px] sm:-mx-8 sm:px-8"
			onSubmit={async (e) => {
				e.preventDefault();
				if (!listId) return;
				try {
					await add({ listId, recordId: record._id });
					setMessage("Added.");
					setListId("");
				} catch (err) {
					setMessage(errorMessage(err));
				}
			}}
		>
			<span className="label">Add to</span>
			<select className="field" value={listId} onChange={(e) => setListId(e.target.value as Id<"lists">)}>
				<option value="">{available.length ? "choose a list…" : "on all your lists"}</option>
				{available.map((list) => (
					<option key={list._id} value={list._id}>
						{list.emoji ? `${list.emoji} ` : ""}
						{list.name}
					</option>
				))}
			</select>
			<button type="submit" className="btn" disabled={!listId}>
				add
			</button>
			{message && <span className="text-muted">{message}</span>}
		</form>
	);
}
