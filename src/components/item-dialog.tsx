import type { Doc } from "@convex/_generated/dataModel";
import { KIND_LABELS } from "@convex/shared/constants";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Art } from "@/components/art";
import { Markdown } from "@/components/markdown";
import { timeAgo } from "@/lib/utils";

type Item = Doc<"items"> & { record: Doc<"records"> };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/**
 * One item of a list up close: big art, the note in full and when it was added. Opened from
 * layouts that leave the note out (the grids). Same modal and backdrop as AddItemDialog.
 */
export function ItemDialog({ item, rank, onClose }: { item: Item | null; rank?: number; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	const open = item !== null;

	useEffect(() => {
		const dialog = ref.current;
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	}, [open]);

	return (
		<dialog
			ref={ref}
			aria-label={item?.record.title ?? "Item"}
			onClose={onClose}
			className="add-dialog fixed inset-0 m-0 size-full max-h-none max-w-none overflow-y-auto bg-transparent p-0 text-ink"
		>
			<div aria-hidden className="add-backdrop fixed inset-0" onClick={onClose}>
				<div className="add-backdrop-dots absolute inset-0" />
			</div>
			{item && <Details key={item._id} item={item} rank={rank} onClose={onClose} />}
		</dialog>
	);
}

function Details({ item, rank, onClose }: { item: Item; rank?: number; onClose: () => void }) {
	const { record } = item;
	const title = record.subtitle && record.kind === "book" ? `${record.title}: ${record.subtitle}` : record.title;
	const meta = [KIND_LABELS[record.kind].one, record.year, record.creators.join(", ")].filter(Boolean);

	return (
		<div className="add-panel halftone relative isolate mx-auto mt-5 mb-10 w-[min(44rem,calc(100%-2.5rem))] sm:mt-[12vh]">
			<div className="border border-[color-mix(in_oklab,var(--ink)_30%,var(--paper))] bg-paper p-5 sm:p-7">
				<div className="flex flex-col gap-5 sm:flex-row sm:gap-7">
					<Art image={record.image} kind={record.kind} alt="" sizes="200px" priority className="w-32 shrink-0 sm:w-50" />
					<div className="min-w-0 flex-1">
						<div className="flex items-start gap-3">
							{rank !== undefined && (
								<span
									className="grid min-w-9 shrink-0 place-items-center border border-edge bg-paper px-1 text-[15px] leading-9 tabular-nums"
									aria-label={`Number ${rank}`}
								>
									{rank}
								</span>
							)}
							<h2 className="min-w-0 flex-1 font-serif text-[clamp(1.7rem,4vw,2.3rem)] leading-[1.05] tracking-tight [overflow-wrap:anywhere]">
								{title}
							</h2>
							<button type="button" className="btn btn-icon shrink-0" onClick={onClose} aria-label="Close" title="Close">
								✕
							</button>
						</div>
						<p className="mt-1.5 text-[12px] text-muted">{meta.join(" · ")}</p>

						<dl className="mt-5 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-3 border-t border-rule pt-4 text-[13px]">
							<dt className="label">Added</dt>
							<dd>
								{dateFormat.format(item._creationTime)}{" "}
								<span className="text-muted">· {timeAgo(item._creationTime)}</span>
							</dd>
							<dt className="label">Note</dt>
							<dd className="min-w-0">
								{item.note ? (
									<Markdown text={item.note} className="prose-note text-[14px] leading-relaxed" />
								) : (
									<span className="text-muted italic opacity-70">No note added</span>
								)}
							</dd>
						</dl>

						<p className="mt-6 text-[13px]">
							<Link
								to="/$kind/$id"
								params={{ kind: record.kind, id: record.sourceId }}
								search={record.language ? { lang: record.language } : {}}
							>
								More about this {KIND_LABELS[record.kind].one} →
							</Link>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
