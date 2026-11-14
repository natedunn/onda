import { AuthClient, defaultStorage } from "@convex-dev/auth/browser";
import { oauth } from "@convex-dev/auth/methods/oauth/react";
import { AuthProvider, type AuthSignInApi, SessionWatcher, useAuth } from "#convex-auth-react-internal";
import { useRouter } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import type { FunctionReference } from "convex/server";
import { type ReactNode, useState } from "react";

type AuthSessionResponse = { tokens: { accessToken: string } | null };

async function postAuth(route: string): Promise<AuthSessionResponse> {
	const res = await fetch(route, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: "{}",
	});
	return (await res.json().catch(() => ({ tokens: null }))) as AuthSessionResponse;
}

export function ConvexAuthStartProvider({
	client,
	initialToken,
	isAuthenticated,
	children,
}: {
	client: ConvexReactClient;
	/** The access token read during SSR, so the client hydrates authenticated. */
	initialToken: string | null;
	/** The app's `isAuthenticated` query (from setupConvexAuth): signs the client out once its session is revoked. */
	isAuthenticated: FunctionReference<"query", "public", Record<string, never>, boolean>;
	children: ReactNode;
}) {
	const router = useRouter();

	const [{ authClient, signInApi }] = useState(() => {
		// Sign-ins go through our /auth/signin proxy (ConvexHttpClient wire
		// format) so the refresh token lands in an httpOnly cookie.
		const proxy = new ConvexHttpClient("/auth/signin?path=", {
			skipConvexDeploymentUrlCheck: true,
			logger: client.logger,
		});
		let authClient: AuthClient;
		const withAuth = () => {
			const token = authClient.getAccessToken();
			if (token !== null) proxy.setAuth(token);
			else proxy.clearAuth();
			return proxy;
		};
		const signInApi: AuthSignInApi = {
			mutation: (fn, args) => withAuth().mutation(fn, args),
			action: (fn, args) => withAuth().action(fn, args),
		};
		authClient = new AuthClient({
			mode: "ssr",
			authApi: {
				refreshSession: async () => (await postAuth("/auth/refresh")).tokens as never,
				signOut: async () => {
					await postAuth("/auth/signout");
				},
			},
			storage: defaultStorage(),
			storageNamespace: client.url,
			initialAccessToken: initialToken,
			ambientSignIns: {
				signIns: [oauth()],
				signInApi,
				convex: { mutation: (fn, args) => client.mutation(fn, args) },
				// Gets an absolute URL; the router's history takes a path.
				replaceUrl: (url) => {
					const { pathname, search, hash } = new URL(url, window.location.href);
					router.history.replace(pathname + search + hash);
				},
			},
		});
		return { authClient, signInApi };
	});

	return (
		<AuthProvider authClient={authClient} signInApi={signInApi}>
			<ConvexProviderWithAuth client={client} useAuth={useAuth}>
				<SessionWatcher isAuthenticated={isAuthenticated} />
				{children}
			</ConvexProviderWithAuth>
		</AuthProvider>
	);
}
