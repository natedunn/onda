import auth from "@convex-dev/auth/convex.config.js";
import authAnonymous from "@convex-dev/auth/components/anonymous/convex.config.js";
import authGithub from "@convex-dev/auth/components/github/convex.config.js";
import authGoogle from "@convex-dev/auth/components/google/convex.config.js";
import authOauth from "@convex-dev/auth/components/oauth/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
	env: {
		AUTH_PRIVATE_KEY: v.string(),
		AUTH_JWKS: v.string(),
		AUTH_GITHUB_CLIENT_ID: v.string(),
		AUTH_GITHUB_CLIENT_SECRET: v.string(),
		AUTH_GOOGLE_CLIENT_ID: v.string(),
		AUTH_GOOGLE_CLIENT_SECRET: v.string(),
		AUTH_DISCORD_CLIENT_ID: v.string(),
		AUTH_DISCORD_CLIENT_SECRET: v.string(),
		// The OAuth gateway's callback per provider, e.g.
		// https://gateway-dev.onda.club/oauth/github/callback. Unset = the
		// deployment's own callback. Needs our @convex-dev/auth patch.
		AUTH_GITHUB_CALLBACK_URL: v.optional(v.string()),
		AUTH_GOOGLE_CALLBACK_URL: v.optional(v.string()),
		AUTH_DISCORD_CALLBACK_URL: v.optional(v.string()),
	},
});

app.use(auth, {
	httpPrefix: "/auth",
	env: {
		AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
		AUTH_JWKS: app.env.AUTH_JWKS,
	},
});
app.use(authGithub, {
	httpPrefix: "/oauth/github",
	env: {
		CLIENT_ID: app.env.AUTH_GITHUB_CLIENT_ID,
		CLIENT_SECRET: app.env.AUTH_GITHUB_CLIENT_SECRET,
		CALLBACK_URL: app.env.AUTH_GITHUB_CALLBACK_URL,
	},
});
app.use(authGoogle, {
	httpPrefix: "/oauth/google",
	env: {
		CLIENT_ID: app.env.AUTH_GOOGLE_CLIENT_ID,
		CLIENT_SECRET: app.env.AUTH_GOOGLE_CLIENT_SECRET,
		CALLBACK_URL: app.env.AUTH_GOOGLE_CALLBACK_URL,
	},
});
app.use(authOauth, {
	name: "authDiscord",
	httpPrefix: "/oauth/discord",
	env: {
		CLIENT_ID: app.env.AUTH_DISCORD_CLIENT_ID,
		CLIENT_SECRET: app.env.AUTH_DISCORD_CLIENT_SECRET,
		CALLBACK_URL: app.env.AUTH_DISCORD_CALLBACK_URL,
	},
});
// Backs the dev-only guest sign-in (see auth.ts). Refused unless AUTH_DEV_GUEST=true.
app.use(authAnonymous);

export default app;
