import type { GenericCtx } from '@convex-dev/better-auth';

import { createClient } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';

import { components } from './_generated/api';
import { DataModel } from './_generated/dataModel';
import { query } from './_generated/server';
import authSchema from './betterAuth/schema';

const siteUrl = process.env.SITE_URL!;

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
	local: {
		schema: authSchema,
	},
});

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	return betterAuth({
		// disable logging when createAuth is called just to generate options.
		// this is not required, but there's a lot of noise in logs without it.
		logger: {
			disabled: false,
		},
		baseUrl: siteUrl,
		database: authComponent.adapter(ctx),
		plugins: [
			// The Convex plugin is required for Convex compatibility
			convex(),
		],
	});
};

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return authComponent.getAuthUser(ctx);
	},
});
