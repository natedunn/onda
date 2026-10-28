import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { KIND_LABELS, type Kind } from "@convex/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { useAction, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Art } from "@/components/art";
import { cn, errorMessage } from "@/lib/utils";

const KIND_KEY = "onda:add-kind";

// Where each kind's search results come from, credited under the results.
const SOURCES: Record<Kind, { name: string; url: string }> = {
	movie: { name: "The Movie Database", url: "https://www.themoviedb.org" },
	show: { name: "The Movie Database", url: "https://www.themoviedb.org" },
	book: { name: "Open Library", url: "https://openlibrary.org" },
	album: { name: "MusicBrainz", url: "https://musicbrainz.org" },
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
	const [kind, setKind] = useState<Kind>("movie");
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Doc<"records">[] | null>(null);
	const [status, setStatus] = useState<"idle" | "searching" | "error">("idle");
	const [error, setError] = useState<string | null>(null);
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
	}, []);
	useEffect(() => {
		if (kinds.length && !kinds.includes(kind)) setKind(kinds[0]!);
	}, [kinds, kind]);

	// Debounced search; stale responses are dropped by request id.
	useEffect(() => {
		const q = query.trim();
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
				const found = await search({ kind, query: q });
				if (id !== requestId.current) return;
				setResults(found);
				setActive(0);
				setStatus("idle");
			} catch (e) {
				if (id !== requestId.current) return;
				setError(errorMessage(e));
				setStatus("error");
			}
		}, 450);
		return () => clearTimeout(timer);
	}, [query, kind, search]);

	const source = SOURCES[kind];
	const shown = status !== "error" && results && results.length > 0 ? results : null;

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
		if (!shown) return;
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
					<button type="button" className="linkish -m-2 ml-auto p-2 text-[12px]" onClick={onClose}>
						done
					</button>
				</div>

				<input
					ref={input}
					data-autofocus
					autoComplete="off"
					role="combobox"
					aria-expanded={!!shown}
					aria-controls="add-results"
					aria-activedescendant={shown?.[active] ? optionId(shown[active]._id) : undefined}
					aria-label={`Search ${KIND_LABELS[kind].many}`}
					className="mt-2 w-full border-0 bg-transparent px-4 py-3 font-serif text-[1.9rem] leading-tight outline-none placeholder:text-muted/70"
					placeholder={`Search for a ${KIND_LABELS[kind].one}…`}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (!shown) return;
						if (e.key === "ArrowDown" || e.key === "ArrowUp") {
							e.preventDefault();
							move(active + (e.key === "ArrowDown" ? 1 : -1));
						} else if (e.key === "Enter" && shown[active]) {
							e.preventDefault();
							void addRecord(shown[active]);
						}
					}}
				/>

				{(status !== "idle" || results) && (
					<div className="border-t border-rule">
						{status === "searching" && <p className="px-4 py-2 text-[12px] text-muted">Searching…</p>}
						{status === "error" && <p className="px-4 py-2 text-[12px] text-danger">{error}</p>}
						{status === "idle" && results?.length === 0 && (
							<p className="px-4 py-2 text-[12px] text-muted">Nothing found.</p>
						)}
						{shown && (
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
											<Art src={r.image} kind={r.kind} alt="" className="w-10" />
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
