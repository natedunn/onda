/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authDiscord from "../authDiscord.js";
import type * as authGateway from "../authGateway.js";
import type * as items from "../items.js";
import type * as lists from "../lists.js";
import type * as media from "../media.js";
import type * as og from "../og.js";
import type * as ogRender from "../ogRender.js";
import type * as providers from "../providers.js";
import type * as records from "../records.js";
import type * as shared_constants from "../shared/constants.js";
import type * as shared_themes from "../shared/themes.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authDiscord: typeof authDiscord;
  authGateway: typeof authGateway;
  items: typeof items;
  lists: typeof lists;
  media: typeof media;
  og: typeof og;
  ogRender: typeof ogRender;
  providers: typeof providers;
  records: typeof records;
  "shared/constants": typeof shared_constants;
  "shared/themes": typeof shared_themes;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authGithub: import("@convex-dev/auth/components/github/_generated/component.js").ComponentApi<"authGithub">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
  authDiscord: import("@convex-dev/auth/components/oauth/_generated/component.js").ComponentApi<"authDiscord">;
  authAnonymous: import("@convex-dev/auth/components/anonymous/_generated/component.js").ComponentApi<"authAnonymous">;
};
