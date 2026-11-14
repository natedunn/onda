import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// One-off for the Convex Auth 2.0.0 upgrade: beta.0 kept every provider's
// accounts in the core component (`auth/accounts`); 2.0.0 keeps them in each
// OAuth component. Without its row, a returning user gets a new onda user
// (unless createOrLink matches a verified email). Feed it the rows exported
// from `auth/accounts`; anonymous (guest) rows are skipped. Idempotent.
// See docs/convex-auth.md, "Upgrading to 2.0.0". Delete after prod is done.

const componentFor = {
	github: components.authGithub,
	google: components.authGoogle,
	discord: components.authDiscord,
} as const;

export const importOauthAccounts = internalMutation({
	args: {
		rows: v.array(
			v.object({
				provider: v.string(),
				providerAccountId: v.string(),
				userId: v.string(),
			}),
		),
	},
	returns: v.object({ created: v.number(), existing: v.number(), skipped: v.array(v.string()) }),
	handler: async (ctx, { rows }) => {
		let created = 0;
		let existing = 0;
		const skipped: string[] = [];
		for (const row of rows) {
			const label = `${row.provider}:${row.providerAccountId}`;
			if (row.provider === "anonymous") continue;
			const component = componentFor[row.provider as keyof typeof componentFor];
			if (!component) {
				skipped.push(`${label} (unknown provider)`);
				continue;
			}
			const userId = ctx.db.normalizeId("users", row.userId);
			if (!userId || !(await ctx.db.get(userId))) {
				skipped.push(`${label} (no such user ${row.userId})`);
				continue;
			}
			const current = await ctx.runQuery(component.provider.getUserIdByAccount, {
				providerAccountId: row.providerAccountId,
			});
			if (current !== null) {
				if (current !== userId) skipped.push(`${label} (already linked to ${current})`);
				else existing++;
				continue;
			}
			await ctx.runMutation(component.provider._internal_dangerous_createAccount, {
				providerAccountId: row.providerAccountId,
				userId,
			});
			created++;
		}
		return { created, existing, skipped };
	},
});
