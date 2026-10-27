#!/usr/bin/env sh
# Workers Builds deploy command, for every branch. See docs/deploy.md.
#
#   main     -> prod Convex (laudable-gecko-621) + the Worker on onda.club
#   <branch> -> a Convex preview named after the branch + a Worker Preview
#               at https://<name>.preview.onda.club
#
# Build variables (Workers Builds → Settings → Variables and secrets):
#   CONVEX_PROD_DEPLOY_KEY, CONVEX_PREVIEW_DEPLOY_KEY
set -eu

branch="${WORKERS_CI_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

if [ "$branch" = main ]; then
	export CONVEX_DEPLOY_KEY="${CONVEX_PROD_DEPLOY_KEY:?CONVEX_PROD_DEPLOY_KEY is not set}"
	export VITE_SITE_URL=https://onda.club
	npx convex deploy --cmd "vite build" --cmd-url-env-var-name VITE_CONVEX_URL
	npx wrangler deploy
	exit 0
fi

# One DNS label: lowercase, [a-z0-9-], no leading/trailing dash.
name="$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' |
	sed 's/[^a-z0-9-]/-/g; s/--*/-/g; s/^-//' | cut -c 1-40 | sed 's/-$//')"
site="https://$name.preview.onda.club"

export CONVEX_DEPLOY_KEY="${CONVEX_PREVIEW_DEPLOY_KEY:?CONVEX_PREVIEW_DEPLOY_KEY is not set}"
export VITE_SITE_URL="$site"
# A new preview starts with the project's preview defaults (`npx convex env
# default list --type preview`); only the app's origin differs per branch.
npx convex deploy --preview-name "$name" --cmd "vite build" --cmd-url-env-var-name VITE_CONVEX_URL
npx convex env --preview-name "$name" set SITE_URL "$site"
npx wrangler preview --name "$name"
echo "Preview: $site"
