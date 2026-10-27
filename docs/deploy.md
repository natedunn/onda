# Deploying

Cloudflare Workers Builds deploys every push to `natedunn/onda`:
`scripts/cloudflare-deploy.sh` for `main`, `scripts/preview-build.sh` then
`wrangler preview` for any other branch.

| Branch | Convex | Worker | URL |
|---|---|---|---|
| `main` | prod, `laudable-gecko-621` | `wrangler deploy` | `https://onda.club` |
| anything else | a preview named after the branch | `wrangler preview --name <branch>` | `https://<branch>.preview.onda.club` |

The branch name becomes one DNS label: lowercased, anything outside
`[a-z0-9-]` turned into `-`, cut to 40 characters (`feat/Lists` →
`feat-lists`).

## Why it's this small

- **Config is baked in at build.** The app only reads `VITE_CONVEX_URL` (set
  by `convex deploy --cmd`) and `VITE_SITE_URL` (set by the script), so the
  Worker has no runtime vars and `previews` in `wrangler.jsonc` is empty.
- **The gateway needs no registration.** A deployment signs its own address
  into the OAuth `state`; the dev gateway accepts any `*.convex.site`. New
  previews sign in through `gateway-dev.onda.club` with no setup.
- **Convex previews start from defaults.** Every new preview copies the
  project's preview defaults (`npx convex env default list --type preview`):
  dev OAuth apps, the dev gateway secret and callbacks, a preview-tier signing
  key pair, `AUTH_DEV_GUEST`, IGDB. The script then sets the one value that
  differs, `SITE_URL`, using the preview deploy key.
- **Cleanup is automatic.** Convex deletes previews after 5 days (Free) / 14
  (Pro) without a deploy; Cloudflare deletes the oldest Worker Previews past
  100 (Free) / 500 (Paid). To delete one now:
  `npx wrangler preview delete --name <name>` and the preview in the Convex
  dashboard.

## Workers Builds settings

Workers & Pages → `onda` → Settings → Builds:

- Git repository: `natedunn/onda`, production branch `main`
- Build command: *(empty)*
- Deploy command: `sh scripts/cloudflare-deploy.sh`
- Preview command (Cloudflare requires it to call `npx wrangler preview`
  itself):
  `sh scripts/preview-build.sh && npx wrangler preview --name "$(sh scripts/preview-name.sh)"`
- Enable Preview builds: **on**. The Worker uses Worker Previews (the
  "Switch to Worker Previews" dialog), not the older preview versions that ran
  with production settings.
- Build variables and secrets (encrypted):
  - `CONVEX_PROD_DEPLOY_KEY`: Convex dashboard → prod deployment → Settings →
    Deploy keys → Generate production deploy key
  - `CONVEX_PREVIEW_DEPLOY_KEY`: Convex dashboard → project Settings →
    Preview deploy keys → Generate

## Changing settings

- **Prod Convex env:** `npx convex env set --deployment laudable-gecko-621 NAME value`
  (pipe secrets in on stdin).
- **Preview defaults:** `CONVEX_DEPLOYMENT=dev:grandiose-yak-969 npx convex
  env default set --type preview NAME value`. Only new previews get the
  change; for an existing one, delete it or set it there.
- **New `VITE_*` value:** export it in `scripts/cloudflare-deploy.sh` for the
  branch(es) that need it.

## Deploying by hand

`pnpm release` deploys prod (needs `CONVEX_PROD_DEPLOY_KEY`);
`pnpm release:preview` previews the current branch (needs
`CONVEX_PREVIEW_DEPLOY_KEY`).

The gateways deploy separately and rarely: see `docs/auth-environments.md`.
