#!/usr/bin/env sh
# Workers Builds preview command, before `npx wrangler preview` (Cloudflare
# requires the command itself to call it). See docs/deploy.md.
#
# Deploys a Convex preview named after the branch and builds the app against
# it. A new preview starts with the project's preview defaults (`npx convex
# env default list --type preview`); only the app's origin differs per branch.
set -eu

name="$(sh scripts/preview-name.sh)"
site="https://$name.preview.onda.club"

export CONVEX_DEPLOY_KEY="${CONVEX_PREVIEW_DEPLOY_KEY:?CONVEX_PREVIEW_DEPLOY_KEY is not set}"
export VITE_SITE_URL="$site"
npx convex deploy --preview-name "$name" --cmd "vite build" --cmd-url-env-var-name VITE_CONVEX_URL
npx convex env --preview-name "$name" set SITE_URL "$site"
echo "Preview: $site"
