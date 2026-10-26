import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupAnonymous } from "@convex-dev/auth/methods/anonymous/server";
import { setupGithub } from "@convex-dev/auth/methods/github/server";
import { setupGoogle } from "@convex-dev/auth/methods/google/server";
import { setupOauth } from "@convex-dev/auth/methods/oauth/server";
import { components, internal } from "./_generated/api";
import { type DiscordProfile, type DiscordUserInfo, discordCatalog } from "./authDiscord";
import { viaGateway } from "./authGateway";

const auth = setupConvexAuth({
	component: components.auth,
	// The default is 60s. Longer keeps SSR and the browser from refreshing
	// constantly; revocation takes effect when the token expires.
	accessTokenTtlSeconds: 10 * 60,
});

export const { signOut, refreshSession, isAuthenticated } = auth;

// Exact origins (comma-separated SITE_URL): each worktree and preview sets its own.
const allowedRedirectOrigins = (process.env.SITE_URL ?? "http://localhost:3030")
	.split(",")
	.map((origin) => origin.trim());

const github = setupGithub(auth, {
	component: components.authGithub,
	allowedRedirectOrigins,
}).attachUserCallbacks({
	createUser: internal.users.createFromGithub,
	onSignIn: internal.users.onGithubSignIn,
});
export const startSignInWithGithub = viaGateway("github", github.startSignInWithGithub);
export const { completeSignInWithGithub } = github;

const google = setupGoogle(auth, {
	component: components.authGoogle,
	allowedRedirectOrigins,
}).attachUserCallbacks({
	createUser: internal.users.createFromGoogle,
	onSignIn: internal.users.onGoogleSignIn,
});
export const startSignInWithGoogle = viaGateway("google", google.startSignInWithGoogle);
export const { completeSignInWithGoogle } = google;

// Annotated: inferring the type from `internal.users` is circular.
type DiscordSignIn = ReturnType<typeof setupOauth<"discord", DiscordProfile, "users", DiscordUserInfo>>;
const discord: DiscordSignIn = setupOauth(
	auth,
	"discord",
	discordCatalog,
	{ createUser: internal.users.createFromDiscord, onSignIn: internal.users.onDiscordSignIn },
	{ component: components.authDiscord, allowedRedirectOrigins },
);
export const startSignInWithDiscord = viaGateway("discord", discord.startSignIn);
export const completeSignInWithDiscord = discord.completeSignIn;

// Dev-only guest accounts so the app can be exercised without an OAuth app.
// createFromGuest refuses unless AUTH_DEV_GUEST=true on the deployment.
export const { signInAnonymously: signInAsGuest } = setupAnonymous(auth, {
	component: components.authAnonymous,
}).attachUserCallbacks({ createUser: internal.users.createFromGuest });
