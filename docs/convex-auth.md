# Convex Auth v2 — plan, patches and upstream tracking

We run `@convex-dev/auth@2.0.0-beta.0` (v2 beta). Upstream: `convex/convex-auth`,
v2 on the `reboot` branch, docs at https://auth-v2.previews.convex.dev. Upstream
targets a stable release in Q4 2026 and says not to use v2 in production yet;
only the newest beta gets fixes, so we upgrade promptly.

This file is the source of truth for what we carry on top of the package. The
scheduled upstream check reads and updates the "Upstream tracking" section.

## What we carry today

| Thing | Where | Why | Remove when |
|---|---|---|---|
| TanStack Start SSR adapter | `src/lib/convex-auth-start/`, `src/routes/auth/*` | Only a Next.js adapter ships | Official framework-agnostic provider/adapter (#350, #126) |
| `#convex-auth-react-internal` alias + `optimizeDeps` exclude | `tsconfig.json`, `vite.config.ts` | `AuthProvider`/`useAuth` aren't exported | Package exports them |
| `try/catch` around `ServerAuthSession.getToken` | `src/lib/convex-auth-start/server.ts` | Throws when a refresh fails | PR #729 lands |
| Dev-only guest sign-in | `convex/auth.ts`, `convex/users.ts` | Exercise the app without an OAuth app | Keep (gated by `AUTH_DEV_GUEST`) |

## Plan — this round

- [ ] **OAuth gateway Worker** (`workers/gateway`, standalone package, own lockfile).
      Tiers: `gateway-dev.onda.club` (local worktrees, previews, cloud dev) and
      `gateway.onda.club` (prod). One OAuth app per provider per tier; the
      provider redirects to `<gateway>/oauth/<provider>/callback`, the gateway
      verifies the routing info in `state` (HMAC, tier secret) against an
      allowlist and 302s to `<deployment CONVEX_SITE_URL>/oauth/<provider>/callback`
      with the query string unchanged. Per-IP rate limit on the callback.
- [ ] **Patch: configurable callback URL** (`pnpm patch @convex-dev/auth`).
      Optional `CALLBACK_URL` component env on `components/{github,google,oauth}`
      and `process.env.CALLBACK_URL ?? <stock>` in `lib/oauth/dbHelpers`.
      Wired per provider in `convex/convex.config.ts`. Unset = stock behavior.
- [ ] **State routing without a patch**: app-side wrapper prefixes `state` in
      the authorize URL with `<b64url(CONVEX_SITE_URL)>.<hmac>.`; the gateway
      strips it before forwarding (the deployment stores only the hash of the
      original state).
- [ ] **Providers**: GitHub (have), Google (`setupGoogle`), Discord (generic
      `setupOauth` + `components/oauth`, our own profile validator).
- [ ] **One user across providers**: add `email` (+ index) to `users`; a shared
      `createUser` returns the existing user when a *verified* email matches.
      Mirror `(provider, accountId)` into our own table for a future
      "connected accounts" view.
- [ ] **Per-environment `SITE_URL`** (allowed redirect origins are exact-match):
      dev script sets it per worktree; CI sets it per preview deployment; prod
      `https://onda.club`.
- [ ] **Rate limiting** (no package patch):
      - Worker routes `/auth/signin|refresh|signout` behind Cloudflare
        `ratelimits` (per IP).
      - Adapter sends `startSignIn*` through a Worker route (per-IP limit) that
        calls our own same-named Convex mutation with a shared secret; that
        mutation runs the package's handler (`_handler`, undocumented) and the
        package's original isn't exported.
      - Global token bucket in Convex (`@convex-dev/rate-limiter`) as a backstop.
- [ ] **Account deletion policy**: anonymize users instead of deleting (deleting
      leaves auth accounts behind and locks the person out). Make `onSignIn`
      tolerate a missing user.
- [ ] **Docs**: `docs/auth-environments.md` — OAuth app setup per tier and
      provider, env vars, verification steps.

## Deferred

- **Sign out everywhere / session revocation** — needs a core-component patch
  (`revokeUserSessions` via `sessions.by_user`). Not shipping this round.
- **Cleanup of abandoned OAuth flows and sessions** — needs component patches;
  negligible impact at our scale and upstream lists it in KNOWN_ISSUES. Wait.
- **Pattern-based redirect origins** — per-environment `SITE_URL` instead.
- **Linking a provider to the signed-in user** — no API; email matching covers
  the common case.

## Upstream tracking

Last checked: **2026-10-18** against `2.0.0-beta.0` (npm `beta` tag).

| Item | Link | Status | Affects |
|---|---|---|---|
| `getToken` stops throwing on refresh failure | PR #729 | draft | adapter `try/catch` |
| Generic OAuth / Discord docs | PR #731 | draft | Discord setup |
| Shared `createUser` across providers | PR #733 | draft | email linking |
| Deploying OAuth docs (separate dev/prod apps) | PR #735 | draft | gateway design |
| http OAuth endpoints on localhost | PR #744 | draft | local backends |
| Ignore unrequested `id_token` | PR #746 | draft | Google/OAuth |
| Authorization params / provider tokens (`state`, `redirect_uri` reserved) | PR #751 | draft, WIP | gateway patch |
| Expired-token `isAuthenticated` docs | PR #723 | draft | SSR checks |
| "provider" → "sign-in method" renames | PRs #696, #749, #750 | open | our wiring (expect breaking renames) |
| OAuth redirect proxy / configurable callback | issue #1 | open, dormant | gateway patch |
| Framework-agnostic SSR adapter | issues #350, #126 | open | adapter |
| Account linking prototype | PR #429 | draft, stale | linking |
| KNOWN_ISSUES: rate limiting, OAuth doc cleanup, one pending flow per browser | `KNOWN_ISSUES.md` on `reboot` | open | rate limiting, cleanup |

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
