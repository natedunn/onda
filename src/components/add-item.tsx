import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { KIND_LABELS, type Kind, LANGUAGE_LABELS, LANGUAGES, type Language } from "@convex/shared/constants";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAction, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Art } from "@/components/art";
import { cn, errorMessage } from "@/lib/utils";

const KIND_KEY = "onda:add-kind";
const LANGUAGE_KEY = "onda:add-language";

// Kinds whose sources answer in other languages; the rest search the same either way.
const LOCALIZED: Kind[] = ["movie", "show", "book"];

// Where each kind's search results come from, credited under the results. `live` kinds
// search a mirror first and offer to ask the source itself (media.search's `live`).
const SOURCES: Record<Kind, { name: string; url: string; live?: true }> = {
	movie: { name: "The Movie Database", url: "https://www.themoviedb.org" },
	show: { name: "The Movie Database", url: "https://www.themoviedb.org" },
	book: { name: "Open Library", url: "https://openlibrary.org" },
	album: { name: "MusicBrainz", url: "https://musicbrainz.org", live: true },
	game: { name: "IGDB", url: "https://www.igdb.com" },
};

/**
 * Search for things and add them to a list, in a modal over a halftone backdrop. Stays open
 * so several things can be added in a row; Escape, the backdrop or "done" closes it.
 */
export function AddItemDialog({
	open,
	onClose,
	listId,
	existing,
}: {
	open: boolean;
	onClose: () => void;
	listId: Id<"lists">;
	existing: Set<string>;
}) {
	const ref = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = ref.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			// showModal focuses the first control (the kind select), but people open this to type,
			// so start in the search box; the select is a Shift+Tab away.
			dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
		}
		if (!open && dialog.open) dialog.close();
	}, [open]);

	return (
		<dialog
			ref={ref}
			aria-label="Add to list"
			onClose={onClose}
			className="add-dialog fixed inset-0 m-0 size-full max-h-none max-w-none overflow-y-auto bg-transparent p-0 text-ink"
		>
			<div aria-hidden className="add-backdrop fixed inset-0" onClick={onClose}>
				<div className="add-backdrop-dots absolute inset-0" />
			</div>
			{/* Remounted on each open, so it starts with an empty search. */}
			{open && <AddItem listId={listId} existing={existing} onClose={onClose} />}
		</dialog>
	);
}

function AddItem({
	listId,
	existing,
	onClose,
}: {
	listId: Id<"lists">;
	existing: Set<string>;
	onClose: () => void;
}) {
	const { data: kinds = [] } = useQuery(convexQuery(api.media.kinds, {}));
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	const [kind, setKind] = useState<Kind>("movie");
	// Experimental: only people who turned the language selector on in settings get a choice.
	const [chosenLanguage, setChosenLanguage] = useState<Language>("en");
	const canChooseLanguage = viewer?.languageSelector === true && LOCALIZED.includes(kind);
	const language = canChooseLanguage ? chosenLanguage : "en";
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Doc<"records">[] | null>(null);
	const [status, setStatus] = useState<"idle" | "searching" | "error">("idle");
	const [error, setError] = useState<string | null>(null);
	// "Not here?": the source's own answer for the current query, after our mirror's.
	const [live, setLive] = useState<
		{ status: "searching" | "error" } | { status: "done"; results: Doc<"records">[] } | null
	>(null);
	const [adding, setAdding] = useState<string | null>(null);
	// The highlighted result, moved with the arrow keys or the pointer; Enter adds it.
	const [active, setActive] = useState(0);
	const search = useAction(api.media.search);
	const add = useMutation(api.items.add);
	const requestId = useRef(0);
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const saved = localStorage.getItem(KIND_KEY) as Kind | null;
		if (saved) setKind(saved);
		const savedLanguage = localStorage.getItem(LANGUAGE_KEY) as Language | null;
		if (savedLanguage && LANGUAGES.includes(savedLanguage)) setChosenLanguage(savedLanguage);
	}, []);
	useEffect(() => {
		if (kinds.length && !kinds.includes(kind)) setKind(kinds[0]!);
	}, [kinds, kind]);

	// Saved records matching the search, shown first and almost instantly. They also keep
	// search useful when the source API is having trouble.
	const term = useDebounced(query.trim(), 150);
	const { data: local = [] } = useQuery({
		...convexQuery(api.media.searchLocal, { kind, query: term, language }),
		enabled: term.length >= 2,
		placeholderData: keepPreviousData,
	});

	// Debounced source search; stale responses are dropped by request id.
	useEffect(() => {
		const q = query.trim();
		setActive(0);
		setLive(null);
		if (q.length < 2) {
			requestId.current++;
			setResults(null);
			setStatus("idle");
			return;
		}
		const id = ++requestId.current;
		const timer = setTimeout(async () => {
			setStatus("searching");
			try {
				const found = await search({ kind, query: q, language });
				if (id !== requestId.current) return;
				setResults(found);
				setStatus("idle");
			} catch (e) {
				if (id !== requestId.current) return;
				setResults(null);
				setError(errorMessage(e));
				setStatus("error");
			}
		}, 450);
		return () => clearTimeout(timer);
	}, [query, kind, language, search]);

	const searchLive = async () => {
		const id = requestId.current;
		setLive({ status: "searching" });
		try {
			const fromSource = await search({ kind, query: query.trim(), live: true, language });
			if (id !== requestId.current) return;
			setLive({ status: "done", results: fromSource });
			// They land at the end of the list, which may be scrolled out of view.
			const first = fromSource.find((r) => !shown.some((x) => x._id === r._id));
			if (first) requestAnimationFrame(() => document.getElementById(optionId(first._id))?.scrollIntoView({ block: "nearest" }));
		} catch {
			if (id === requestId.current) setLive({ status: "error" });
		}
	};

	const source = SOURCES[kind];
	// Saved matches on top; a source result for the same record is the same row (the
	// search just refreshed it), so it isn't listed twice. "Not here?" results go last.
	const unique = (rs: Doc<"records">[]) => rs.filter((r, i) => rs.findIndex((x) => x._id === r._id) === i);
	const found = query.trim().length >= 2 ? unique([...local, ...(results ?? [])]) : [];
	const liveNew =
		query.trim().length >= 2 && live?.status === "done"
			? live.results.filter((r) => !found.some((x) => x._id === r._id))
			: [];
	const shown = [...found, ...liveNew];

	const addRecord = async (r: Doc<"records">) => {
		if (existing.has(r._id) || adding) return;
		setAdding(r._id);
		try {
			await add({ listId, recordId: r._id });
		} catch (e) {
			alert(errorMessage(e));
		} finally {
			setAdding(null);
		}
	};

	const move = (to: number) => {
		if (!shown.length) return;
		const i = (to + shown.length) % shown.length;
		setActive(i);
		document.getElementById(optionId(shown[i]!._id))?.scrollIntoView({ block: "nearest" });
	};

	return (
		<div className="add-panel halftone relative isolate mx-auto mt-5 mb-10 sm:mt-[12vh] w-[min(38rem,calc(100%-2.5rem))]">
			<div className="border border-[color-mix(in_oklab,var(--ink)_30%,var(--paper))] bg-paper">
				<div className="flex items-center gap-3 px-4 pt-4">
					<label className="flex items-center gap-2">
						<span className="label">Add a</span>
						<select
							className="field py-1 pl-2.5 text-[13px] leading-6 pointer-coarse:text-[16px]"
							value={kind}
							onChange={(e) => {
								const k = e.target.value as Kind;
								setKind(k);
								localStorage.setItem(KIND_KEY, k);
								input.current?.focus();
							}}
						>
							{kinds.map((k) => (
								<option key={k} value={k}>
									{KIND_LABELS[k].title}
								</option>
							))}
						</select>
					</label>
					{canChooseLanguage && (
						<label className="flex items-center gap-2">
							<span className="label">in</span>
							<select
								className="field py-1 pl-2.5 text-[13px] leading-6 pointer-coarse:text-[16px]"
								value={chosenLanguage}
								onChange={(e) => {
									const l = e.target.value as Language;
									setChosenLanguage(l);
									localStorage.setItem(LANGUAGE_KEY, l);
									input.current?.focus();
								}}
							>
								{LANGUAGES.map((l) => (
									<option key={l} value={l}>
										{LANGUAGE_LABELS[l]}
									</option>
								))}
							</select>
						</label>
					)}
					<button type="button" className="linkish -m-2 ml-auto p-2 text-[12px]" onClick={onClose}>
						done
					</button>
				</div>

				<input
					ref={input}
					data-autofocus
					autoComplete="off"
					role="combobox"
					aria-expanded={shown.length > 0}
					aria-controls="add-results"
					aria-activedescendant={shown?.[active] ? optionId(shown[active]._id) : undefined}
					aria-label={`Search ${KIND_LABELS[kind].many}`}
					className="mt-2 w-full border-0 bg-transparent px-4 py-3 font-serif text-[1.9rem] leading-tight outline-none placeholder:text-muted/70"
					placeholder={`Search for a ${KIND_LABELS[kind].one}…`}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (!shown.length) return;
						if (e.key === "ArrowDown" || e.key === "ArrowUp") {
							e.preventDefault();
							move(active + (e.key === "ArrowDown" ? 1 : -1));
						} else if (e.key === "Enter" && shown[active]) {
							e.preventDefault();
							void addRecord(shown[active]);
						}
					}}
				/>

				{(status !== "idle" || results || shown.length > 0) && (
					<div className="border-t border-rule">
						{status === "searching" && <p className="px-4 py-2 text-[12px] text-muted">Searching…</p>}
						{status === "error" &&
							(shown.length ? (
								<p className="px-4 py-2 text-[12px] text-muted">
									Couldn't reach {source.name} for more results. Try again in a moment.
								</p>
							) : (
								<p className="px-4 py-2 text-[12px] text-danger">{error}</p>
							))}
						{status === "idle" && results && shown.length === 0 && (
							<p className="px-4 py-2 text-[12px] text-muted">Nothing found.</p>
						)}
						{shown.length > 0 && (
							// Phones scroll the whole dialog instead: an inner scroller ends up half under the keyboard.
							<ul id="add-results" role="listbox" className="sm:max-h-[min(26rem,55vh)] sm:overflow-y-auto">
								{shown.map((r, i) => {
									const already = existing.has(r._id);
									return (
										// Clicking anywhere on the row adds it; focus stays in the search box.
										<li
											key={r._id}
											id={optionId(r._id)}
											role="option"
											aria-selected={i === active}
											aria-disabled={already}
											onMouseMove={() => setActive(i)}
											onMouseDown={(e) => e.preventDefault()}
											onClick={() => addRecord(r)}
											className={cn(
												"flex items-center gap-3 border-b border-rule px-4 py-2 last:border-b-0",
												already ? "cursor-default" : "cursor-pointer",
												i === active && "bg-paper-2",
											)}
										>
											<Art image={r.image} kind={r.kind} alt="" sizes="40px" className="w-10" />
											<div className="min-w-0 flex-1">
												<p className="truncate font-bold">
													{r.title}
													{r.year && <span className="font-normal text-muted"> ({r.year})</span>}
												</p>
												<p className="truncate text-[11px] text-muted">
													{[r.subtitle, r.creators.join(", ")].filter(Boolean).join(" · ")}
												</p>
											</div>
											<span aria-hidden className={cn("btn pointer-events-none", already ? "opacity-50" : i === active && "btn-primary")}>
												{already ? "added" : adding === r._id ? "…" : "add"}
											</span>
										</li>
									);
								})}
							</ul>
						)}
						{source.live && status !== "searching" && (
							<p className="border-t border-rule px-4 py-2 text-[12px] text-muted">
								{!live && (
									<button type="button" className="linkish" onClick={searchLive}>
										Not here? Search {source.name} directly
									</button>
								)}
								{live?.status === "searching" && `Searching ${source.name}…`}
								{live?.status === "error" && `Couldn't reach ${source.name}. Try again in a moment.`}
								{live?.status === "done" &&
									(liveNew.length
										? `${liveNew.length} more from ${source.name} above.`
										: `Nothing else on ${source.name}.`)}
							</p>
						)}
					</div>
				)}

				<div className="flex items-center justify-between gap-3 border-t border-rule bg-paper-2 px-4 py-2 text-[11px] text-muted">
					<p>
						Powered by{" "}
						<a href={source.url} target="_blank" rel="noreferrer">
							{source.name}
						</a>
					</p>
					{/* Open Library's search is quirky; this explains what to expect. New tab, so the search survives. */}
					{kind === "book" && (
						<a
							href="/experimental"
							target="_blank"
							rel="noreferrer"
							className="bg-mark px-1.5 text-ink no-underline hover:underline"
						>
							Experimental ↗
						</a>
					)}
				</div>
			</div>
		</div>
	);
}

const optionId = (id: string) => `add-result-${id}`;

function useDebounced<T>(value: T, ms: number) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(timer);
	}, [value, ms]);
	return debounced;
}
