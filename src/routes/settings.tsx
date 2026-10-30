import { useAuthActions } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { LIMITS } from "@convex/shared/constants";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { type CSSProperties, useState } from "react";
import { PALETTE, saveTheme, type Theme } from "@/lib/theme";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
	beforeLoad: ({ context }) => {
		if (!context.token) throw redirect({ to: "/sign-in" });
	},
	head: () => ({ meta: [{ title: "Settings · onda" }] }),
	component: Settings,
});

const SECTIONS = [
	{ id: "profile", label: "Profile" },
	{ id: "privacy", label: "Privacy" },
	{ id: "appearance", label: "Appearance" },
	{ id: "experimental", label: "Experimental" },
	{ id: "account", label: "Account" },
];

function Settings() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (!viewer) return null;
	return (
		<>
			<h1 className="mb-8 font-serif text-5xl">Settings</h1>
			<div className="grid gap-x-12 gap-y-6 md:grid-cols-[10rem_minmax(0,1fr)]">
				<nav className="md:sticky md:top-6 md:self-start">
					<ul className="flex flex-wrap gap-x-4 gap-y-1 md:flex-col">
						{SECTIONS.map((section) => (
							<li key={section.id}>
								<a href={`#${section.id}`}>{section.label}</a>
							</li>
						))}
					</ul>
				</nav>
				<div className="space-y-8 [&_fieldset]:scroll-mt-6">
					<ProfileForm viewer={viewer} />
					<Appearance />
					<Experimental viewer={viewer} />
					<Account viewer={viewer} />
				</div>
			</div>
		</>
	);
}

function ProfileForm({ viewer }: { viewer: Doc<"users"> }) {
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
			className="space-y-8"
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
			<fieldset id="profile" className="box grid gap-5 lg:grid-cols-2">
				<legend>Profile</legend>
				<div className="flex items-center gap-4 lg:col-span-2">
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
				<label className="block lg:col-span-2">
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

			<fieldset id="privacy" className="box">
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

const THEMES: { value: Theme; label: string; hint: string }[] = [
	{ value: "system", label: "System", hint: "Follows your device." },
	{ value: "light", label: "Light", hint: "Ink on paper." },
	{ value: "dark", label: "Dark", hint: "Paper on ink." },
];

function Appearance() {
	const router = useRouter();
	const [theme, setTheme] = useState(Route.useRouteContext({ select: (context) => context.theme }));

	return (
		<fieldset id="appearance" className="box">
			<legend>Appearance</legend>
			<div className="grid gap-3 sm:grid-cols-3">
				{THEMES.map((option) => (
					<label
						key={option.value}
						className="block cursor-pointer border border-rule p-2 hover:border-muted has-checked:border-ink"
					>
						<ThemePreview theme={option.value} />
						<span className="mt-2 flex items-baseline gap-2">
							<input
								type="radio"
								name="theme"
								value={option.value}
								checked={theme === option.value}
								onChange={() => {
									setTheme(option.value);
									saveTheme(option.value);
									// Picks the new cookie up into the root's context (and its theme-color).
									void router.invalidate();
								}}
							/>
							<span>
								<b>{option.label}</b> <span className="text-muted">— {option.hint}</span>
							</span>
						</span>
					</label>
				))}
			</div>
			<p className="mt-3 text-[11px] text-muted">Saved on this device.</p>
		</fieldset>
	);
}

/** A thumbnail of a page in the given palette; "system" shows light and dark split across the diagonal. */
function ThemePreview({ theme }: { theme: Theme }) {
	return (
		<div className="relative h-20 overflow-hidden border border-rule" aria-hidden>
			{theme !== "dark" && <PreviewPage colors={PALETTE.light} />}
			{theme !== "light" && (
				<PreviewPage
					colors={PALETTE.dark}
					style={theme === "system" ? { clipPath: "polygon(100% 0, 100% 100%, 0 100%)" } : undefined}
				/>
			)}
		</div>
	);
}

function PreviewPage({ colors, style }: { colors: (typeof PALETTE)["light"]; style?: CSSProperties }) {
	return (
		<div className="absolute inset-0 px-3 py-2" style={{ background: colors.paper, color: colors.ink, ...style }}>
			<div className="font-serif text-3xl leading-none">Aa</div>
			<div className="mt-2 h-px w-3/4" style={{ background: colors.rule }} />
			<div className="mt-2 h-3 w-10 border" style={{ borderColor: colors.ink, boxShadow: `2px 2px 0 ${colors.ink}` }} />
		</div>
	);
}

function Experimental({ viewer }: { viewer: Doc<"users"> }) {
	const setLanguageSelector = useMutation(api.users.setLanguageSelector);
	const [error, setError] = useState<string | null>(null);

	return (
		<fieldset id="experimental" className="box">
			<legend>Experimental</legend>
			<label className="flex items-baseline gap-2">
				<input
					type="checkbox"
					checked={viewer.languageSelector ?? false}
					onChange={async (e) => {
						setError(null);
						try {
							await setLanguageSelector({ enabled: e.target.checked });
						} catch (err) {
							setError(errorMessage(err));
						}
					}}
				/>
				<span>
					<b>Language selector</b>{" "}
					<span className="text-muted">
						— search for movies, shows and books in English or Spanish when adding to a list.{" "}
						<a href="/experimental#language-selector">More</a>
					</span>
				</span>
			</label>
			{error && <p className="mt-2 text-danger">{error}</p>}
		</fieldset>
	);
}

function Account({ viewer }: { viewer: Doc<"users"> }) {
	const router = useRouter();
	const { signOut } = useAuthActions();
	return (
		<fieldset id="account" className="box flex flex-wrap items-center justify-between gap-3">
			<legend>Account</legend>
			<p className="text-[12px] text-muted">Signed in as @{viewer.username}.</p>
			<button
				type="button"
				className="btn"
				onClick={async () => {
					await signOut();
					await router.invalidate();
					await router.navigate({ to: "/" });
				}}
			>
				Sign out
			</button>
		</fieldset>
	);
}
