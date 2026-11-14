# Convex Auth v2 — plan, patches and upstream tracking

We run `@convex-dev/auth@2.0.0` (v2 stable, npm `latest`). Upstream:
`convex/convex-auth`, v2 on `main`, docs at https://docs.convex.dev. We follow
npm releases, not unreleased `main` commits: when the check finds a new
release, it opens an upgrade PR (see "How to run the check").

This file is the source of truth for what we carry on top of the package. The
scheduled upstream check reads and updates the "Upstream tracking" section.

## What we carry today

| Thing | Where | Why | Remove when |
|---|---|---|---|
| TanStack Start SSR adapter | `src/lib/convex-auth-start/`, `src/routes/auth/*` | Only a Next.js adapter ships | Official framework-agnostic provider/adapter (#350, #126) |
| `#convex-auth-react-internal` alias + `optimizeDeps` exclude | `tsconfig.json`, `vite.config.ts` | `AuthProvider`/`useAuth`/`SessionWatcher` aren't exported | Package exports them |
| `customConditions: ["convex-auth-internal-types"]` | `tsconfig.json`, `convex/tsconfig.json` | The public `.d.ts` strip the `@internal` APIs our patch re-exports; this resolves the package's full types everywhere, so the two type trees don't mix | Custom OAuth and anonymous are public again |
| `try/catch` around `ServerAuthSession.getToken` | `src/lib/convex-auth-start/server.ts` | Throws when a refresh fails | `getToken` stops throwing (#729 closed unmerged) |
| Dev-only guest sign-in | `convex/auth.ts`, `convex/users.ts` | Exercise the app without an OAuth app | Keep (gated by `AUTH_DEV_GUEST`); needs the patch's anonymous re-export |
| **Patch**: optional `CALLBACK_URL` component env | `patches/@convex-dev__auth@2.0.0.patch` (`lib/oauth/dbHelpers.js`, `components/{github,google,oauth}/convex.config.*`) | Callback is hardwired to the deployment's own URL; we need the gateway's | Configurable callback / redirect proxy upstream (#1) |
| **Patch**: re-export custom OAuth and anonymous | same patch, `package.json` `exports` (`methods/{oauth,anonymous}/*`, `components/{oauth,anonymous}/*`) | 2.0.0 hides them ("until the API for custom OAuth providers is stable", #836; anonymous until account linking, #827); the files still ship | Upstream makes them public again (#849, #848, #847) |
| `viaGateway` wrapper around each `startSignIn*` | `convex/authGateway.ts` | Puts the signed routing prefix on `state`; calls the package's mutation through `_handler` (undocumented) | Same as above |
| Discord catalog + profile | `convex/authDiscord.ts` | No built-in Discord method | Keep (or built-in Discord method) |
| One-off accounts import | `convex/authMigration.ts` | 2.0.0 upgrade of prod (see "Upgrading to 2.0.0") | After prod and cloud dev are migrated |
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

- **Sign out everywhere** — 2.0.0 has it (`ctx.convexAuth.revokeOtherSessions`,
  core `listSessions`/`revokeSessions`; `SessionWatcher` signs revoked clients
  out). Needs only a settings button.
- **Cleanup of abandoned OAuth flows and sessions** — needs component patches;
  negligible impact at our scale and upstream lists it in KNOWN_ISSUES. Wait.
- **Pattern-based redirect origins** — per-environment `SITE_URL` instead.
- **Linking a provider to the signed-in user** — no API; email matching covers
  the common case.

## Upgrading to 2.0.0

Done in the 2.0.0 upgrade PR: `convex@^1.48`; `convexAuthProvider()` in
`convex/auth.config.ts` (the deployment signs the JWTs: ES256, issuer
`<CONVEX_CLOUD_URL>/components/auth`, audience `convex-auth`); no signing-key
env and no `httpPrefix` on the core component (it has no HTTP routes now);
callbacks take `method: { name, profile }`; `SessionWatcher` in the adapter;
the patch above. Sessions now last at most 30 days (`sessionMaxLifetimeSeconds`).

Per existing deployment (prod `laudable-gecko-621`, cloud dev
`grandiose-yak-969`), in this order. Rehearsed on a local beta.0 backend:
the push refuses old `auth/sessions`/`auth/refreshTokens` rows and old
`authAnonymous/accounts` rows; the leftover `auth/accounts` doesn't block it
and stays readable afterwards.

1. Right before deploying, clear `auth/refreshTokens`, `auth/sessions` and
   `authAnonymous/accounts` (dashboard "Clear table", or
   `npx convex import --component <c> --table <t> --replace --format jsonLines -y empty.jsonl`
   with an empty file). This signs everyone out.
2. Deploy. For prod that is merging the PR (Workers Builds runs
   `convex deploy`). If someone signed in after step 1, the push fails
   schema validation and nothing ships: clear again and retry the build.
3. Straight after (until then, a returning user whose email doesn't match
   gets a new onda user), export the old accounts and import them into the
   OAuth components. Anonymous rows are skipped, rerunning is safe; check
   that `skipped` is empty:
   ```sh
   npx convex data --component auth accounts --format jsonl --limit 10000 > accounts.jsonl
   npx convex run authMigration:importOauthAccounts "$(node -e 'const rows = require("fs").readFileSync("accounts.jsonl", "utf8").trim().split("\n").map((l) => { const { provider, providerAccountId, userId } = JSON.parse(l); return { provider, providerAccountId, userId }; }); console.log(JSON.stringify({ rows }))')"
   ```
   Add `--deployment <name>` to both.
4. Delete the `auth/accounts` table, and remove `AUTH_PRIVATE_KEY`/`AUTH_JWKS`
   from the deployment and from the Convex preview defaults.

## Upstream tracking

Last checked: **2026-11-13**. `2.0.0` (2026-11-12, tag `v2.0.0` = `f73ec439`) is
`main` `ce759739` plus docs and dependency commits; everything listed as
"merged since beta.0" in the 2026-11-12 check shipped in it and is handled by
the upgrade (above). `main` after the release: docs, passkey example, Google
profile gains the Workspace `hd` (#926), dependency bumps — nothing for us.

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
3. Status of every item in the "Open — tracked" table, plus new issues/PRs mentioning:
   callback, redirect_uri, proxy, state, tanstack, ssr, rate limit, cleanup,
   linking, discord, google, revoke, sessions.
4. For a new version: diff the published package against the one installed
   (`npm pack` both into fresh temp dirs) for `lib/oauth/dbHelpers`,
   `lib/oauth/authorize`, `components/*/convex.config`, `react/index`,
   `ssr/*`, and the method setup APIs we call — will our patch still apply,
   can the adapter shrink, are there breaking renames?
5. Update this section (date, version, statuses) and the plan; report what
   needs action.
6. For a new release (not alpha): open an upgrade PR from a worktree
   off `origin/main` (branch `deps/convex-auth-<version>`). Pin the exact
   version, regenerate the patch (`pnpm patch @convex-dev/auth`, reapply,
   `pnpm patch-commit`) or drop it if upstream now covers the callback URL,
   work through the CHANGELOG's upgrade steps and adapt the adapter, update the
   docs, and run `pnpm check` and `pnpm build`. Prod steps (clearing tables,
   removing env vars) go in the PR description as a checklist; never run them.
