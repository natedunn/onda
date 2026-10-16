import { useSignInWithGithub, useOauth } from "@convex-dev/auth/methods/github/react";
import { useSignInAnonymously } from "@convex-dev/auth/methods/anonymous/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/sign-in")({
	beforeLoad: ({ context }) => {
		if (context.token) throw redirect({ to: "/" });
	},
	head: () => ({ meta: [{ title: "Sign in · onda" }] }),
	component: SignIn,
});

function SignIn() {
	const { signIn } = useSignInWithGithub(api.auth);
	const { flowError } = useOauth();
	const { data: guestEnabled } = useQuery(convexQuery(api.users.guestEnabled, {}));
	const [pending, setPending] = useState(false);

	return (
		<div className="max-w-[26rem]">
			<h1 className="font-serif text-5xl">Sign in</h1>
			<p className="mt-3">
				New here? Signing in makes your account. Your GitHub username becomes your onda
				username, and you can change it later.
			</p>
			<p className="mt-6">
				<button
					type="button"
					className="btn btn-primary"
					disabled={pending}
					onClick={async () => {
						setPending(true);
						await signIn({ redirectTo: `${window.location.origin}/` });
					}}
				>
					{pending ? "Heading to GitHub…" : "Continue with GitHub"}
				</button>
			</p>
			<p className="mt-3 text-[11px] text-muted">Google and Discord are coming soon.</p>
			{flowError && (
				<p className="mt-4 text-danger">
					{flowError.error === "ACCESS_DENIED"
						? "Sign-in was cancelled."
						: flowError.error === "EXPIRED"
							? "That sign-in took too long. Try again."
							: "Sign-in didn't finish. Try again."}
				</p>
			)}
			{guestEnabled && <GuestSignIn />}
		</div>
	);
}

/** Dev-only; the backend refuses unless AUTH_DEV_GUEST=true. */
function GuestSignIn() {
	const { signIn } = useSignInAnonymously({ signInAnonymously: api.auth.signInAsGuest });
	const router = useRouter();
	return (
		<fieldset className="box mt-10">
			<legend>Dev</legend>
			<p className="mb-3 text-muted">Guest accounts are enabled on this deployment.</p>
			<button
				type="button"
				className="btn"
				onClick={async () => {
					await signIn();
					await router.invalidate();
					await router.navigate({ to: "/" });
				}}
			>
				Sign in as a guest
			</button>
		</fieldset>
	);
}
