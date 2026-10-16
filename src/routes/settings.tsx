import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { LIMITS } from "@convex/shared/constants";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
	beforeLoad: ({ context }) => {
		if (!context.token) throw redirect({ to: "/sign-in" });
	},
	head: () => ({ meta: [{ title: "Settings · onda" }] }),
	component: Settings,
});

function Settings() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (!viewer) return null;
	return <SettingsForm viewer={viewer} />;
}

function SettingsForm({ viewer }: { viewer: Doc<"users"> }) {
	const update = useMutation(api.users.updateProfile);
	const navigate = useNavigate();
	const [form, setForm] = useState({
		username: viewer.username,
		name: viewer.name ?? "",
		bio: viewer.bio ?? "",
		isPrivate: viewer.isPrivate,
	});
	const [status, setStatus] = useState<{ kind: "error" | "saved"; text: string } | null>(null);
	const [saving, setSaving] = useState(false);

	return (
		<form
			className="max-w-[32rem] space-y-8"
			onSubmit={async (e) => {
				e.preventDefault();
				setSaving(true);
				setStatus(null);
				try {
					const { username } = await update(form);
					if (username !== viewer.username) {
						await navigate({ to: "/@{$username}", params: { username } });
					} else {
						setStatus({ kind: "saved", text: "Saved." });
					}
				} catch (err) {
					setStatus({ kind: "error", text: errorMessage(err) });
				} finally {
					setSaving(false);
				}
			}}
		>
			<h1 className="font-serif text-5xl">Settings</h1>

			<fieldset className="box space-y-5">
				<legend>Profile</legend>
				<div className="flex items-center gap-4">
					{viewer.image && <img src={viewer.image} alt="" className="size-14 border border-ink object-cover" />}
					<p className="text-[12px] text-muted">Your photo comes from GitHub and updates when you sign in.</p>
				</div>
				<label className="block">
					<span className="label">Username</span>
					<div className="mt-1 flex items-center">
						<span className="border border-r-0 border-rule bg-paper-2 px-2 py-[0.35em] text-muted">@</span>
						<input
							className="field"
							value={form.username}
							onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
							minLength={3}
							maxLength={30}
							required
						/>
					</div>
					<span className="text-[11px] text-muted">Changing it changes your profile's address.</span>
				</label>
				<label className="block">
					<span className="label">Display name</span>
					<input className="field mt-1" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} />
				</label>
				<label className="block">
					<span className="label">About</span>
					<textarea
						className="field mt-1"
						rows={3}
						maxLength={LIMITS.bio}
						value={form.bio}
						onChange={(e) => setForm({ ...form, bio: e.target.value })}
						placeholder="A line about you."
					/>
					<span className="text-[11px] text-muted">
						{form.bio.length}/{LIMITS.bio}
					</span>
				</label>
			</fieldset>

			<fieldset className="box">
				<legend>Privacy</legend>
				<label className="flex items-baseline gap-2">
					<input type="checkbox" checked={form.isPrivate} onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })} />
					<span>
						<b>Private profile</b>{" "}
						<span className="text-muted">— hide your profile page. Lists you share by link still work.</span>
					</span>
				</label>
			</fieldset>

			<div className="flex items-center gap-3">
				<button type="submit" className="btn btn-primary" disabled={saving}>
					{saving ? "Saving…" : "Save settings"}
				</button>
				{status && <span className={status.kind === "error" ? "text-danger" : "text-muted"}>{status.text}</span>}
			</div>
		</form>
	);
}
