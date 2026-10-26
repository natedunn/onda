import { useSignInWithGithub } from "@convex-dev/auth/methods/github/react";
import { useSignInWithGoogle } from "@convex-dev/auth/methods/google/react";
import { useOauth, useOauthSignIn } from "@convex-dev/auth/methods/oauth/react";
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

const PROVIDERS = ["github", "google", "discord"] as const;
type Provider = (typeof PROVIDERS)[number];
const PROVIDER_LABELS: Record<Provider, string> = { github: "GitHub", google: "Google", discord: "Discord" };

function SignIn() {
	const signIns: Record<Provider, ReturnType<typeof useSignInWithGithub>["signIn"]> = {
		github: useSignInWithGithub(api.auth).signIn,
		google: useSignInWithGoogle(api.auth).signIn,
		discord: useOauthSignIn({
			providerName: "discord",
			startSignIn: api.auth.startSignInWithDiscord,
			completeSignIn: api.auth.completeSignInWithDiscord,
		}).signIn,
	};
	const { flowError } = useOauth();
	const { data: guestEnabled } = useQuery(convexQuery(api.users.guestEnabled, {}));
	const [pending, setPending] = useState<Provider | null>(null);
	const [startError, setStartError] = useState(false);

	return (
		<div className="max-w-[26rem]">
			<h1 className="font-serif text-5xl">Sign in</h1>
			<p className="mt-3">
				New here? Signing in makes your account. Your username comes from the account you
				pick, and you can change it later.
			</p>
			<div className="mt-6 flex flex-col items-start gap-3">
				{PROVIDERS.map((provider, i) => (
					<button
						key={provider}
						type="button"
						className={i === 0 ? "btn btn-primary" : "btn"}
						disabled={pending !== null}
						onClick={async () => {
							setPending(provider);
							setStartError(false);
							const result = await signIns[provider]({ redirectTo: `${window.location.origin}/` });
							if (result.status === "error") {
								setPending(null);
								setStartError(true);
							}
						}}
					>
						{pending === provider
							? `Heading to ${PROVIDER_LABELS[provider]}…`
							: `Continue with ${PROVIDER_LABELS[provider]}`}
					</button>
				))}
			</div>
			<p className="mt-3 text-[11px] text-muted">
				Same email on two of these? They sign you into the same account.
			</p>
			{(flowError || startError) && (
				<p className="mt-4 text-danger">
					{flowError?.error === "ACCESS_DENIED"
						? "Sign-in was cancelled."
						: flowError?.error === "EXPIRED"
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
