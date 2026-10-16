import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupAnonymous } from "@convex-dev/auth/methods/anonymous/server";
import { setupGithub } from "@convex-dev/auth/methods/github/server";
import { components, internal } from "./_generated/api";

const auth = setupConvexAuth({
	component: components.auth,
	// The default is 60s. Longer keeps SSR and the browser from refreshing
	// constantly; revocation takes effect when the token expires.
	accessTokenTtlSeconds: 10 * 60,
});

export const { signOut, refreshSession, isAuthenticated } = auth;

export const { startSignInWithGithub, completeSignInWithGithub } = setupGithub(
	auth,
	{
		component: components.authGithub,
		allowedRedirectOrigins: (process.env.SITE_URL ?? "http://localhost:3030")
			.split(",")
			.map((origin) => origin.trim()),
	},
).attachUserCallbacks({
	createUser: internal.users.createFromGithub,
	onSignIn: internal.users.onGithubSignIn,
});

// Dev-only guest accounts so the app can be exercised without an OAuth app.
// createFromGuest refuses unless AUTH_DEV_GUEST=true on the deployment.
export const { signInAnonymously: signInAsGuest } = setupAnonymous(auth, {
	component: components.authAnonymous,
}).attachUserCallbacks({ createUser: internal.users.createFromGuest });
