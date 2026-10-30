import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { toLayout } from "./shared/constants";

/**
 * Rewrites lists saved with a renamed view ID (OLD_LAYOUTS) to the new one, a page at a time.
 * Run once per deployment: `npx convex run migrations:layoutIds` (add `--prod` for production).
 * Once it has run everywhere, drop the old IDs from the schema and delete this.
 */
export const layoutIds = internalMutation({
	args: { cursor: v.optional(v.union(v.string(), v.null())) },
	handler: async (ctx, { cursor }) => {
		const page = await ctx.db.query("lists").paginate({ cursor: cursor ?? null, numItems: 200 });
		for (const list of page.page) {
			const layout = toLayout(list.layout);
			if (layout && layout !== list.layout) await ctx.db.patch(list._id, { layout });
		}
		if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrations.layoutIds, { cursor: page.continueCursor });
	},
});
