import auth from "@convex-dev/auth/convex.config.js";
import authAnonymous from "@convex-dev/auth/components/anonymous/convex.config.js";
import authGithub from "@convex-dev/auth/components/github/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
	env: {
		AUTH_PRIVATE_KEY: v.string(),
		AUTH_JWKS: v.string(),
		AUTH_GITHUB_CLIENT_ID: v.string(),
		AUTH_GITHUB_CLIENT_SECRET: v.string(),
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
	},
});
// Backs the dev-only guest sign-in (see auth.ts). Refused unless AUTH_DEV_GUEST=true.
app.use(authAnonymous);

export default app;
