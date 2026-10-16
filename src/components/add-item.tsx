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

export function AddItem({
	listId,
	existing,
}: {
	listId: Id<"lists">;
	existing: Set<string>;
}) {
	const { data: kinds = [] } = useQuery(convexQuery(api.media.kinds, {}));
	const [kind, setKind] = useState<Kind>("movie");
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Doc<"records">[] | null>(null);
	const [status, setStatus] = useState<"idle" | "searching" | "error">("idle");
	const [error, setError] = useState<string | null>(null);
	const [adding, setAdding] = useState<string | null>(null);
	const search = useAction(api.media.search);
	const add = useMutation(api.items.add);
	const requestId = useRef(0);

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
				setStatus("idle");
			} catch (e) {
				if (id !== requestId.current) return;
				setError(errorMessage(e));
				setStatus("error");
			}
		}, 450);
		return () => clearTimeout(timer);
	}, [query, kind, search]);

	return (
		<div className="border border-ink bg-paper p-4 shadow-[3px_3px_0_var(--ink)]">
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span className="label">Add a</span>
				{kinds.map((k) => (
					<button
						key={k}
						type="button"
						onClick={() => {
							setKind(k);
							localStorage.setItem(KIND_KEY, k);
						}}
						className={cn(
							"linkish",
							k === kind && "bg-ink px-1 text-paper no-underline hover:bg-ink hover:text-paper",
						)}
					>
						{KIND_LABELS[k].one}
					</button>
				))}
			</div>
			<input
				autoFocus
				className="field mt-3"
				placeholder={`Search ${KIND_LABELS[kind].many}…`}
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>
			<div className="mt-2 min-h-6 text-[12px]">
				{status === "searching" && <p className="text-muted">Searching…</p>}
				{status === "error" && <p className="text-danger">{error}</p>}
				{status === "idle" && results?.length === 0 && <p className="text-muted">Nothing found.</p>}
			</div>
			{results && results.length > 0 && (
				<ul className="mt-1 max-h-[26rem] overflow-y-auto border-t border-rule">
					{results.map((r) => {
						const already = existing.has(r._id);
						return (
							<li key={r._id} className="flex items-center gap-3 border-b border-rule py-2">
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
								<button
									type="button"
									className="btn"
									disabled={already || adding === r._id}
									onClick={async () => {
										setAdding(r._id);
										try {
											await add({ listId, recordId: r._id });
										} catch (e) {
											alert(errorMessage(e));
										} finally {
											setAdding(null);
										}
									}}
								>
									{already ? "added" : adding === r._id ? "…" : "add"}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
