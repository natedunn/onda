#!/usr/bin/env sh
# Workers Builds deploy command (main): prod Convex (laudable-gecko-621), then
# the Worker on onda.club. Previews: scripts/preview-build.sh. See docs/deploy.md.
set -eu

: "${CONVEX_DEPLOY_KEY:?CONVEX_DEPLOY_KEY (the prod deploy key) is not set}"
export VITE_SITE_URL=https://onda.club
npx convex deploy --cmd "vite build" --cmd-url-env-var-name VITE_CONVEX_URL
npx wrangler deploy
