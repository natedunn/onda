import type { OauthCatalog } from "@convex-dev/auth/methods/oauth/server";
import { type Infer, v } from "convex/values";

// Discord has no built-in Convex Auth method, so it runs on the generic OAuth
// component with this catalog. Plain OAuth (no id_token): identity comes
// from /users/@me.

export const vDiscordProfile = v.object({
	id: v.string(),
	username: v.string(),
	name: v.optional(v.string()),
	email: v.optional(v.string()),
	/** Discord's `verified`: the account's email is confirmed. */
	emailVerified: v.boolean(),
	avatarUrl: v.optional(v.string()),
});

export type DiscordProfile = Infer<typeof vDiscordProfile>;

export type DiscordUserInfo = { user: DiscordUser };

type DiscordUser = {
	id?: unknown;
	username?: unknown;
	global_name?: unknown;
	avatar?: unknown;
	email?: unknown;
	verified?: unknown;
};

const str = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);

export const discordCatalog: OauthCatalog<DiscordProfile, DiscordUserInfo> = {
	authorizationEndpoint: "https://discord.com/oauth2/authorize",
	tokenEndpoint: "https://discord.com/api/oauth2/token",
	userInfoEndpoints: { user: "https://discord.com/api/users/@me" },
	scopes: ["identify", "email"],
	profile: (_claims, responses) => {
		const user = responses?.user;
		const id = str(user?.id);
		const username = str(user?.username);
		if (!id || !username) throw new Error("Discord /users/@me returned no id or username");
		const avatar = str(user?.avatar);
		const email = str(user?.email);
		return {
			id,
			username,
			name: str(user?.global_name) ?? username,
			email,
			emailVerified: email !== undefined && user?.verified === true,
			avatarUrl: avatar && `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=256`,
		};
	},
};
