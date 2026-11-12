# Convex Auth v2 — plan, patches and upstream tracking

We run `@convex-dev/auth@2.0.0-beta.0` (v2 beta). Upstream: `convex/convex-auth`,
v2 on the `reboot` branch, docs at https://auth-v2.previews.convex.dev. Upstream
targets a stable release in Q4 2026 and says not to use v2 in production yet;
only the newest beta gets fixes, so we upgrade promptly. We follow npm
releases (beta, then stable), not unreleased `reboot` commits: when the check
finds a new release, it opens an upgrade PR (see "How to run the check").

This file is the source of truth for what we carry on top of the package. The
scheduled upstream check reads and updates the "Upstream tracking" section.

## What we carry today

| Thing | Where | Why | Remove when |
|---|---|---|---|
| TanStack Start SSR adapter | `src/lib/convex-auth-start/`, `src/routes/auth/*` | Only a Next.js adapter ships | Official framework-agnostic provider/adapter (#350, #126) |
| `#convex-auth-react-internal` alias + `optimizeDeps` exclude | `tsconfig.json`, `vite.config.ts` | `AuthProvider`/`useAuth` aren't exported | Package exports them |
| `try/catch` around `ServerAuthSession.getToken` | `src/lib/convex-auth-start/server.ts` | Throws when a refresh fails | PR #729 lands |
| Dev-only guest sign-in | `convex/auth.ts`, `convex/users.ts` | Exercise the app without an OAuth app | Keep (gated by `AUTH_DEV_GUEST`) |
| **Patch**: optional `CALLBACK_URL` component env | `patches/@convex-dev__auth.patch` (`lib/oauth/dbHelpers.js`, `components/{github,google,oauth}/convex.config.*`) | Callback is hardwired to the deployment's own URL; we need the gateway's | Configurable callback / redirect proxy upstream (#1) |
| `viaGateway` wrapper around each `startSignIn*` | `convex/authGateway.ts` | Puts the signed routing prefix on `state`; calls the package's mutation through `_handler` (undocumented) | Same as above |
| Discord catalog + profile | `convex/authDiscord.ts` | No built-in Discord method | Keep (or built-in Discord method) |
| OAuth gateway Worker | `workers/gateway` | One callback per provider per tier, shared by every deployment | Same as the patch |

## Plan — this round

- [x] **OAuth gateway Worker** (`workers/gateway`, standalone package, own lockfile).
      Tiers: `gateway-dev.onda.club` (local worktrees, previews, cloud dev) and
      `gateway.onda.club` (prod). One OAuth app per provider per tier; the
      provider redirects to `<gateway>/oauth/<provider>/callback`, the gateway
      verifies the routing info in `state` (HMAC, tier secret) against an
      allowlist and 302s to `<deployment CONVEX_SITE_URL>/oauth/<provider>/callback`
      with the query string unchanged. Per-IP rate limit on the callback.
- [x] **Patch: configurable callback URL** (`pnpm patch @convex-dev/auth`).
      Optional `CALLBACK_URL` component env on `components/{github,google,oauth}`
      and `process.env.CALLBACK_URL ?? <stock>` in `lib/oauth/dbHelpers`.
      Wired per provider in `convex/convex.config.ts`. Unset = stock behavior.
- [x] **State routing without a patch**: app-side wrapper prefixes `state` in
      the authorize URL with `<b64url(CONVEX_SITE_URL)>.<hmac>.`; the gateway
      strips it before forwarding (the deployment stores only the hash of the
      original state).
- [x] **Providers**: GitHub (have), Google (`setupGoogle`), Discord (generic
      `setupOauth` + `components/oauth`, our own profile validator).
- [x] **One user across providers**: add `email` (+ index) to `users`; a shared
      `createUser` returns the existing user when a *verified* email matches.
      (Not done: mirroring `(provider, accountId)` into our own table for a
      "connected accounts" view — add it with that view.)
- [x] **Per-environment `SITE_URL`** (allowed redirect origins are exact-match):
      `scripts/dev-seed.sh` sets it per checkout (`docs/local-dev.md`); CI per
      preview deployment; prod `https://onda.club`.
- [ ] **Rate limiting** (no package patch):
      - Worker routes `/auth/signin|refresh|signout` behind Cloudflare
        `ratelimits` (per IP).
      - Adapter sends `startSignIn*` through a Worker route (per-IP limit) that
        calls our own same-named Convex mutation with a shared secret; that
        mutation runs the package's handler (`_handler`, undocumented) and the
        package's original isn't exported.
      - Global token bucket in Convex (`@convex-dev/rate-limiter`) as a backstop.
- [ ] **Account deletion policy**: anonymize users instead of deleting (deleting
      leaves auth accounts behind and locks the person out). `onSignIn` already
      tolerates a missing user; there's no delete-account feature yet.
- [x] **Docs**: `docs/auth-environments.md` — OAuth app setup per tier and
      provider, env vars, verification steps.

- [x] **Deploy**: both gateways (`gateway-dev`, `gateway`) with their tier
      secrets; gateway env on `grandiose-yak-969`, prod (`laudable-gecko-621`)
      and the Convex preview defaults. App deploys: `docs/deploy.md`.

### How the gateway flow works

1. `startSignInWith<Provider>` (`viaGateway`) runs the package's start, then
   rewrites `state` in the provider URL to
   `<b64url(CONVEX_SITE_URL)>.<b64url(HMAC(secret, provider + "\n" + site))>.<state>`.
   The client keeps the plain state. `redirect_uri` is the gateway (patch).
2. The provider redirects to `<gateway>/oauth/<provider>/callback`.
3. The gateway verifies the HMAC with `ROUTING_SECRET`, checks the target
   against `ALLOWED_TARGETS`, and 302s to
   `<target>/oauth/<provider>/callback` with the plain state.
4. The deployment's stock callback finishes; the code exchange sends the
   gateway URL as `redirect_uri`, matching step 1.

Env per deployment: `AUTH_GATEWAY_SECRET` (= the tier's `ROUTING_SECRET`)
and `AUTH_{GITHUB,GOOGLE,DISCORD}_CALLBACK_URL`. Leave them all unset to use
the deployment's own callbacks.

## Deferred

- **Sign out everywhere / session revocation** — needs a core-component patch
  (`revokeUserSessions` via `sessions.by_user`). Not shipping this round.
- **Cleanup of abandoned OAuth flows and sessions** — needs component patches;
  negligible impact at our scale and upstream lists it in KNOWN_ISSUES. Wait.
- **Pattern-based redirect origins** — per-environment `SITE_URL` instead.
- **Linking a provider to the signed-in user** — no API; email matching covers
  the common case.

## Upstream tracking

Last checked: **2026-11-12** against `2.0.0-beta.0` (npm `beta` tag; no newer
v2 release since 2026-10-15; `latest` is v1 `0.0.98`, a fix for
GHSA-hmvv-g278-4x95, which covers v1 email/phone codes only, `<0.0.98`, and
doesn't apply to us). **v2 moved from `reboot` to `main`** (#880; `reboot` is
deleted, and releases now publish from `main`). `main` head `ce759739`
(2026-11-12), 77 commits since `a7bdf81d`. CHANGELOG has an "Unreleased"
section with **breaking schema and API changes** (below). Our patch targets
changed (`lib/oauth/dbHelpers` gains account helpers, and
`components/oauth/convex.config` is now `@internal`), so expect to regenerate
the patch. Shared `ssr/*` is unchanged.

**Merged since beta.0 (land in the next beta). Upgrade checklist:**

| Item | Link | Affects |
|---|---|---|
| **Custom OAuth hidden**: `methods/oauth/server` and `components/oauth/convex.config` removed from the package exports (`@internal` "until the API for custom OAuth providers is stable") | PR #836 | **Discord sign-in** (`convex/auth.ts` `setupOauth`, `convex/authDiscord.ts` `OauthCatalog`, `convex/convex.config.ts` `authOauth`) stops resolving. Options: add the two exports back in our patch (the dist files still ship), or wait for the return (open #849, #848) |
| **Anonymous method hidden** from the exports (returns with account linking) | PR #827 | dev-only guest sign-in (`setupAnonymous`, `authAnonymous`): re-export it via our patch, or drop guest sign-in |
| **Accounts move into the components**: each OAuth component (and anonymous) keeps its own `accounts`; core `auth/accounts` goes away; `resolveUserId`/`getUserIdByAccount` removed | PRs #818, #819 | **prod data migration**: copy each OAuth row of `auth/accounts` into the `accounts` table of `authGithub`/`authGoogle`/`authDiscord`, or the user gets a new onda user on the next sign-in (our verified-email match in `convex/users.ts` would catch most, but not unverified Discord emails). Then clear `authAnonymous/accounts`, delete `auth/accounts`, and clear `auth/sessions` + `auth/refreshTokens` (CHANGELOG "Unreleased" steps) |
| **User callbacks**: `provider: { name, accountId, profile }` → `method: { name, profile }` (no `accountId`; for OAuth use `profile.id`) | PRs #860, #889 | `convex/users.ts`: `providerArgs` validators and every `createFrom*`/`on*SignIn` handler |
| `sessions.provider` → `component`; core tracks the users it created | PRs #861, #869 | schema (covered by clearing `auth/sessions`) |
| Core must be mounted as `auth`; `componentName` option removed | PR #842 | none (ours is `auth`) |
| Unsafe component functions renamed `_internal_dangerous_*` (e.g. OAuth `createAuthorizationRequest`, core `signIn`) | PRs #877, #881 | none directly (`viaGateway` wraps the method's `startSignIn`, not the component); recheck when regenerating the patch |
| Public "provider" names renamed (`GithubProviderOptions` → `GithubOptions`, …) | PR #749 | none found; recheck types on upgrade |
| `npx @convex-dev/auth` CLI removed; refuse OAuth sign-in without `httpPrefix`; TTL/URL validation at setup; error codes; passkey/password/docs work | #821, #742, #736, #822, #838, #839, #871, #799, #803–#814, #875, #873, #891, #892–#895 | none |
| **Deployment-issued JWTs**: no `AUTH_PRIVATE_KEY`/`AUTH_JWKS`; JWKS served by the deployment; **needs `convex@^1.48`** (peer dep) | PR #787 | bump `convex` (we have `^1.47`); drop both from `convex/convex.config.ts` (app env + `app.use(auth)` env), `scripts/dev-seed.sh` check (`AUTH_JWKS`), env docs, and the vars on every deployment; everyone re-signs in |
| `convexAuthProvider()` helper for `auth.config.ts` | PR #788 | replace our hand-written `customJwt` provider in `convex/auth.config.ts` (its `/auth/.well-known/jwks.json` URL goes away with #787; the helper also covers the new audience, #800) |
| **Stateful sessions**: JWT `sub` is the session id; `getAuthUserId` looks up a live session (optional component-ref arg; default `auth` matches ours) | PR #757 | `getAuthUserId` callers unchanged; revocation becomes immediate; old tokens invalid → re-sign-in |
| **Session revocation**: `ctx.convexAuth.revokeOtherSessions`, component `listSessions`/`revokeSessions` | PR #759 | Deferred "sign out everywhere" — now doable without a patch |
| `isAuthenticated` reads from the session | PR #760 | `convex/auth.ts` re-exports it; no code change |
| **Reactive sign-out**: `SessionWatcher` inside `ConvexProviderWithAuth`; `ConvexAuthApi` gains `isAuthenticated` | PR #761 | adapter `provider.tsx` must render `<SessionWatcher isAuthenticated={api.auth.isAuthenticated} />` (export from `react/client`, reachable through `#convex-auth-react-internal`), or revoked sessions stay signed in until the next failed refresh |
| JWT audience is `convex-auth` | PR #800 | invalidates existing tokens (same sign-out); handled by `convexAuthProvider()` |
| Session expiry = sooner of `refreshInactivityTimeoutSeconds` and `sessionMaxLifetimeSeconds`; `refreshTokenTtlSeconds` renamed; TTL config validated at push | PRs #798, #801 | none (`convex/auth.ts` only sets `accessTokenTtlSeconds`); defaults keep the 30-day lifetime |
| "sign-in method" wording in docs/comments/errors | PR #696 | none (no API renames) |
| Remove `sessions.lastRefreshedAt` — **schema-breaking: clear the sessions table before upgrading** | PR #758 | upgrade step (everyone signed out once) |
| Refresh-token expiry from issue time + current TTL; remove `refreshTokens.expiresAt` — **schema-breaking: clear `auth/refreshTokens` and `auth/sessions` before upgrading** | PR #781 | upgrade step (same sign-out as #758) |
| Cap sessions per user at 100 (oldest revoked) | PR #783 | none |
| Remove `accessTokenExpiresAt` from the token bundle | PR #777 | none (adapter only reads `accessToken`) |
| Remove `authAction` from auth-method helpers | PR #776 | none |
| Password-reset revocation; email+password secrets; Next.js clock; docs site; misc | #775, #779, #722, #726, #720, #748, #763, #784, #790–#794, #747, #766, #762–#774 | none |

**Open — tracked:**

| Item | Link | Status | Affects |
|---|---|---|---|
| **`ambientSignIns` internal; `oauth` no longer exported from `methods/oauth/react`** (both providers register it by default) | PR #750 | open, active 11-10 | adapter `provider.tsx` imports `oauth` and passes `ambientSignIns` — if merged, drop both (our `AuthProvider` alias may need the default registration too) |
| Custom OAuth settings from the component env; tickets redeemed in the components with user attestations | PRs #849, #848 | open | the path back for Discord on the generic OAuth component |
| Attestations (components sign facts; sessions created from them); anonymous on attestations | PRs #841, #843, #847 | open | `completeSignIn` args will change again; anonymous may return |
| Erase expired sessions with a batch-worker loop | PR #785 | draft, active 11-11 | Deferred "cleanup" |
| Count every revoked session in `revokeOtherSessions` | PR #786 | draft | Deferred "sign out everywhere" |
| `getToken` throws on refresh failure | PR #729 | **closed unmerged** 11-10 | keep our `try/catch` in the adapter |
| Better Auth → v2 migration path + TanStack Start SSR via public APIs (third party) | issue #796 | open, no reply | adapter |
| OAuth redirect proxy / configurable callback | issue #1 | open, dormant | gateway patch |
| Framework-agnostic SSR adapter | issues #350, #126 | open, no activity | adapter |
| KNOWN_ISSUES: rate limiting, OAuth flow cleanup, one pending flow per browser | `KNOWN_ISSUES.md` on `main` | open | rate limiting, cleanup |

Closed unmerged on 11-07/11-10 (upstream draft cleanup), dropped from tracking:
#789, #780, #778, #731, #733, #735, #744, #746, #751, #723, #429.

### How to run the check

1. `npm view @convex-dev/auth dist-tags versions --json` — new beta/alpha/stable?
2. `gh api repos/convex/convex-auth/commits?sha=main&since=<last checked>` and
   the `main` `CHANGELOG.md` / `KNOWN_ISSUES.md` diffs (v2 lives on `main` since 2026-11-11; `reboot` is gone) since last check.
3. Status of every item in the table above, plus new issues/PRs mentioning:
   callback, redirect_uri, proxy, state, tanstack, ssr, rate limit, cleanup,
   linking, discord, google, revoke, sessions.
4. For a new version: diff the published package against the one installed
   (`npm pack` both into fresh temp dirs) for `lib/oauth/dbHelpers`,
   `lib/oauth/authorize`, `components/*/convex.config`, `react/index`,
   `ssr/*`, and the method setup APIs we call — will our patch still apply,
   can the adapter shrink, are there breaking renames?
5. Update this section (date, version, statuses) and the plan; report what
   needs action.
6. For a new beta or stable (not alpha): open an upgrade PR from a worktree
   off `origin/main` (branch `deps/convex-auth-<version>`). Pin the exact
   version, regenerate the patch (`pnpm patch @convex-dev/auth`, reapply,
   `pnpm patch-commit`) or drop it if upstream now covers the callback URL,
   work through "Merged since beta.0" above and adapt the adapter, update the
   docs, and run `pnpm check` and `pnpm build`. Prod steps (clearing tables,
   removing env vars) go in the PR description as a checklist; never run them.
