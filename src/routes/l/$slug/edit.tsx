import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { LIMITS, type Layout, type Visibility } from "@convex/shared/constants";
import { meshGradient, randomSeed, THEMES } from "@convex/shared/themes";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { ListCover } from "@/components/list-cover";
import { cn, errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/l/$slug/edit")({
	validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
		new: search.new === true || search.new === "true" ? true : undefined,
	}),
	beforeLoad: ({ context, params }) => {
		if (!context.token) throw redirect({ to: "/sign-in" });
		return { slug: params.slug };
	},
	loader: async ({ context, params }) => {
		const data = await context.queryClient.ensureQueryData(convexQuery(api.lists.get, { slug: params.slug }));
		if (!data?.isOwner) throw notFound();
	},
	head: () => ({ meta: [{ title: "Edit list · onda" }] }),
	component: EditList,
});

const EMOJI = "🎬📚💿🎮📺🍿🎧🎸🎹🎤🏆⭐️🔥💀🎃👻🌙☀️🌊🌲🍂❄️🌸💔❤️✨⚡️🍕🍷☕️🛸🚀🎲🧩📼📷🗺️🏝️🤠🍈".match(
	/\p{Extended_Pictographic}️?/gu,
)!;

const VISIBILITY_HELP: Record<Visibility, string> = {
	public: "Anyone can see it, and it shows on your profile.",
	unlisted: "Only people with the link can see it.",
	private: "Only you can see it.",
};

const LAYOUT_HELP: Record<Layout, string> = {
	list: "Artwork, details and notes.",
	compact: "One tidy line per item.",
	grid: "Cover wall.",
};

function EditList() {
	const { slug } = Route.useParams();
	const { new: isNew } = Route.useSearch();
	const { data } = useSuspenseQuery(convexQuery(api.lists.get, { slug }));
	if (!data) return null;
	// Keyed so a fresh copy of the form state is made if the list changes underneath.
	return <EditForm key={data.list._id} list={data.list} isNew={isNew === true} />;
}

function EditForm({ list, isNew }: { list: Doc<"lists">; isNew: boolean }) {
	const update = useMutation(api.lists.update);
	const remove = useMutation(api.lists.remove);
	const navigate = useNavigate();

	const [form, setForm] = useState({
		name: list.name,
		emoji: list.emoji ?? "",
		description: list.description ?? "",
		visibility: list.visibility,
		layout: list.layout,
		ranked: list.ranked,
		theme: list.theme,
		seed: list.seed,
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
		setForm((f) => ({ ...f, [key]: value }));

	async function save(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			await update({ listId: list._id, ...form, emoji: form.emoji || null });
			await navigate({ to: "/l/$slug", params: { slug: list.slug } });
		} catch (err) {
			setError(errorMessage(err));
			setSaving(false);
		}
	}

	return (
		<form onSubmit={save} className="space-y-8">
			<div className="flex items-end gap-5">
				<ListCover
					theme={form.theme}
					seed={form.seed}
					emoji={form.emoji}
					className="w-28 border border-ink shadow-[4px_4px_0_var(--ink)]"
					emojiClassName="text-5xl"
				/>
				<div>
					<p className="label">{isNew ? "A new list" : "Editing"}</p>
					<h1 className="font-serif text-5xl leading-none">{form.name || "Untitled"}</h1>
					<p className="mt-2 text-[12px]">
						<Link to="/l/$slug" params={{ slug: list.slug }}>
							← back to the list
						</Link>
					</p>
				</div>
			</div>

			<fieldset className="box space-y-5">
				<legend>Details</legend>
				<label className="block">
					<span className="label">Name</span>
					<input
						className="field mt-1 font-serif text-xl"
						value={form.name}
						maxLength={LIMITS.listName}
						onChange={(e) => set("name", e.target.value)}
						required
					/>
				</label>
				<div>
					<span className="label">Emoji</span>
					<div className="mt-1 flex flex-wrap items-center gap-1">
						<input
							className="field w-14! text-center text-xl"
							value={form.emoji}
							onChange={(e) => set("emoji", e.target.value)}
							aria-label="Emoji"
						/>
						{EMOJI.map((emoji) => (
							<button
								key={emoji}
								type="button"
								className={cn(
									"grid size-8 place-items-center text-lg hover:bg-mark",
									form.emoji === emoji && "outline outline-ink",
								)}
								onClick={() => set("emoji", emoji)}
							>
								{emoji}
							</button>
						))}
						<button type="button" className="linkish ml-2 text-[12px]" onClick={() => set("emoji", "")}>
							none
						</button>
					</div>
				</div>
				<label className="block">
					<span className="label">Description</span>
					<textarea
						className="field mt-1"
						rows={4}
						maxLength={LIMITS.listDescription}
						value={form.description}
						onChange={(e) => set("description", e.target.value)}
						placeholder="What's this list about?"
					/>
					<span className="text-[11px] text-muted">
						Supports **bold**, *italic*, ~~strike~~ and [links](https://example.com).
					</span>
				</label>
			</fieldset>

			<fieldset className="box space-y-5">
				<legend>Display</legend>
				<RadioGroup
					label="Who can see it"
					value={form.visibility}
					options={VISIBILITY_HELP}
					onChange={(v) => set("visibility", v)}
				/>
				<RadioGroup label="Default view" value={form.layout} options={LAYOUT_HELP} onChange={(v) => set("layout", v)} />
				<label className="flex items-baseline gap-2">
					<input type="checkbox" checked={form.ranked} onChange={(e) => set("ranked", e.target.checked)} />
					<span>
						<b>Ranked</b> <span className="text-muted">— number the items, top to bottom.</span>
					</span>
				</label>
			</fieldset>

			<fieldset className="box">
				<legend>Colors</legend>
				<div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
					{THEMES.map((theme) => (
						<button
							key={theme.id}
							type="button"
							title={theme.name}
							onClick={() => set("theme", theme.id)}
							className={cn(
								"grain aspect-square border border-rule",
								form.theme === theme.id && "border-ink shadow-[3px_3px_0_var(--ink)]",
							)}
							style={meshGradient(theme.id, form.seed)}
						>
							<span className="sr-only">{theme.name}</span>
						</button>
					))}
				</div>
				<p className="mt-3 flex items-center gap-3 text-[12px]">
					<button type="button" className="btn" onClick={() => set("seed", randomSeed())}>
						↻ Shuffle gradient
					</button>
					<span className="text-muted">{THEMES.find((t) => t.id === form.theme)?.name}</span>
				</p>
			</fieldset>

			<div className="flex items-center gap-3">
				<button type="submit" className="btn btn-primary" disabled={saving}>
					{saving ? "Saving…" : "Save list"}
				</button>
				<Link to="/l/$slug" params={{ slug: list.slug }} className="text-[12px]">
					cancel
				</Link>
				{error && <span className="text-danger">{error}</span>}
			</div>

			<fieldset className="box border-danger/50">
				<legend className="text-danger">Danger</legend>
				<p className="mb-3">Deleting a list removes it and everything on it. There's no undo.</p>
				<button
					type="button"
					className="btn btn-danger"
					onClick={async () => {
						const typed = prompt(`Type "delete" to delete “${list.name}”.`);
						if (typed?.trim().toLowerCase() !== "delete") return;
						try {
							await remove({ listId: list._id });
							await navigate({ to: "/" });
						} catch (err) {
							alert(errorMessage(err));
						}
					}}
				>
					Delete this list
				</button>
			</fieldset>
		</form>
	);
}

function RadioGroup<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: Record<T, string>;
	onChange: (value: T) => void;
}) {
	return (
		<div role="radiogroup" aria-label={label}>
			<span className="label">{label}</span>
			<div className="mt-1 space-y-1">
				{(Object.keys(options) as T[]).map((key) => (
					<label key={key} className="flex items-baseline gap-2">
						<input type="radio" checked={value === key} onChange={() => onChange(key)} />
						<span>
							<b className="capitalize">{key}</b> <span className="text-muted">— {options[key]}</span>
						</span>
					</label>
				))}
			</div>
		</div>
	);
}
