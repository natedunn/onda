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

Last checked: **2026-10-29** against `2.0.0-beta.0` (npm `beta` tag; no newer
release). `reboot` head `db15c82e` (2026-10-29), 18 commits since `4943dd19`.
CHANGELOG/KNOWN_ISSUES unchanged. None of our patch targets
(`lib/oauth/dbHelpers`, `components/{github,google,oauth}/convex.config`)
changed, so the patch should still apply. `ssr/*` changes are comment-only.

**Merged since beta.0 (land in the next beta). Upgrade checklist:**

| Item | Link | Affects |
|---|---|---|
| **Deployment-issued JWTs**: no `AUTH_PRIVATE_KEY`/`AUTH_JWKS`; JWKS served by the deployment; **needs `convex@^1.48`** (peer dep) | PR #787 | bump `convex` (we have `^1.47`); drop both from `convex/convex.config.ts` (app env + `app.use(auth)` env), `scripts/dev-seed.sh` check (`AUTH_JWKS`), env docs, and the vars on every deployment; everyone re-signs in |
| `convexAuthProvider()` helper for `auth.config.ts` | PR #788 | replace our hand-written `customJwt` provider in `convex/auth.config.ts` (its `/auth/.well-known/jwks.json` URL goes away with #787) |
| **Stateful sessions**: JWT `sub` is the session id; `getAuthUserId` looks up a live session (optional component-ref arg; default `auth` matches ours) | PR #757 | `getAuthUserId` callers unchanged; revocation becomes immediate; old tokens invalid → re-sign-in |
| **Session revocation**: `ctx.convexAuth.revokeOtherSessions`, component `listSessions`/`revokeSessions` | PR #759 | Deferred "sign out everywhere" — now doable without a patch |
| `isAuthenticated` reads from the session | PR #760 | `convex/auth.ts` re-exports it; no code change |
| "sign-in method" wording in docs/comments/errors | PR #696 | none (no API renames) |
| Remove `sessions.lastRefreshedAt` — **schema-breaking: clear the sessions table before upgrading** | PR #758 | upgrade step (everyone signed out once) |
| Remove `accessTokenExpiresAt` from the token bundle | PR #777 | none (adapter only reads `accessToken`) |
| Remove `authAction` from auth-method helpers | PR #776 | none |
| Password-reset revocation; email+password secrets; Next.js clock; docs site; misc | #775, #779, #722, #726, #720, #748, #763, #790–#794, #747, #766, #762–#774 | none |

**Open — tracked:**

| Item | Link | Status | Affects |
|---|---|---|---|
| **`ambientSignIns` internal; `oauth` no longer exported from `methods/oauth/react`** (both providers register it by default) | PR #750 | open, active 10-29 | adapter `provider.tsx` imports `oauth` and passes `ambientSignIns` — if merged, drop both (our `AuthProvider` alias may need the default registration too) |
| Rename public "provider" names (`GithubProviderOptions` → `GithubOptions`, `completeSignUp` → `…WithEmailPassword`, test helpers) | PR #749 | open, active 10-29 | none found in our code; check `convex/authDiscord.ts` types on upgrade |
| Sign clients out reactively on revocation | PR #761 | open, ready | adapter (client) |
| Cap sessions per user at 100 | PR #783 | open (was draft) | none |
| Erase expired sessions with a batch-worker loop | PR #785 | draft | Deferred "cleanup" — sessions/refresh tokens (not OAuth flow rows) |
| Re-run the Convex auth handshake when the signed-in user changes | PR #789 | draft | adapter uses the same `AuthProvider` — fixes guest→GitHub switching running as the old user |
| Export `ConvexAuthNextjsProvider`; apps own the Convex client | PR #780 | draft | possible model for slimming our `provider.tsx` |
| Component args instead of `.attachUserCallbacks` (exploration, "do not review") | PR #778 | draft | would change `convex/auth.ts` wiring if adopted |
| `getToken` stops throwing on refresh failure | PR #729 | draft | adapter `try/catch` |
| Generic OAuth / Discord docs | PR #731 | draft | Discord setup |
| Shared `createUser` across providers | PR #733 | draft | email linking |
| Deploying OAuth docs (separate dev/prod apps) | PR #735 | draft | gateway design |
| http OAuth endpoints on localhost | PR #744 | draft | local backends |
| Ignore unrequested `id_token` | PR #746 | draft | Google/OAuth |
| Authorization params / provider tokens (`state`, `redirect_uri` reserved) | PR #751 | draft, WIP | gateway patch |
| Expired-token `isAuthenticated` docs | PR #723 | draft | SSR checks |
| Better Auth → v2 migration path + TanStack Start SSR via public APIs (third party) | issue #796 | open, new | adapter — watch for a maintainer answer on #126/#350 |
| OAuth redirect proxy / configurable callback | issue #1 | open, dormant | gateway patch |
| Framework-agnostic SSR adapter | issues #350, #126 | open, no activity | adapter |
| Account linking prototype | PR #429 | draft, stale | linking |
| KNOWN_ISSUES: rate limiting, OAuth flow cleanup, one pending flow per browser | `KNOWN_ISSUES.md` on `reboot` | open | rate limiting, cleanup |

### How to run the check

1. `npm view @convex-dev/auth dist-tags versions --json` — new beta/alpha/stable?
2. `gh api repos/convex/convex-auth/commits?sha=reboot&since=<last checked>` and
   the `reboot` `CHANGELOG.md` / `KNOWN_ISSUES.md` diffs since last check.
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
