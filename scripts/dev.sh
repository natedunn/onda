#!/usr/bin/env sh
# `pnpm dev`: this checkout's own local Convex backend, plus the app through
# Portless at https://onda.localhost:1355 (main checkout) or
# https://<worktree>.onda.localhost:1355 (any other worktree). Each checkout
# has its own URL, ports and data, so several can run at once. See
# docs/local-dev.md.
set -eu

root="$(git rev-parse --show-toplevel)"
main="$(git worktree list --porcelain | head -1 | cut -d' ' -f2-)"
cd "$root"

if [ "$root" = "$main" ]; then
	name=onda
	cloud=3210
else
	label="$(basename "$root" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g; s/--*/-/g; s/^-//; s/-$//; s/^onda-//')"
	name="$label.onda"
	# Stable per worktree, in a band clear of Portless (4000-4999) and the
	# OS's ephemeral ports.
	cloud=$((20000 + $(printf '%s' "$root" | cksum | cut -d' ' -f1) % 6000 * 2))
fi
site=$((cloud + 1))

export PORTLESS_PORT="${PORTLESS_PORT:-1355}"
url="https://$name.localhost:$PORTLESS_PORT"

[ -d node_modules ] || pnpm install --frozen-lockfile
# A new checkout: point the Convex CLI at this checkout's own local backend.
[ -f .env.local ] || printf 'CONVEX_DEPLOYMENT=anonymous:anonymous-agent\n' > .env.local

export CONVEX_AGENT_MODE=anonymous
npx convex dev --local-cloud-port "$cloud" --local-site-port "$site" &
convex_pid=$!
trap 'kill "$convex_pid" 2>/dev/null' EXIT INT TERM

sh scripts/dev-seed.sh "$cloud" "$url" &

# Passed in rather than read from .env.local, which a new checkout only gets
# once Convex is up.
VITE_CONVEX_URL="http://127.0.0.1:$cloud" VITE_CONVEX_SITE_URL="http://127.0.0.1:$site" VITE_SITE_URL="$url" \
	portless "$name" --force vite dev
