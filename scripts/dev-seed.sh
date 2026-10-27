#!/usr/bin/env sh
# Run by scripts/dev.sh once the local backend is up. A new backend gets the
# dev settings (OAuth apps, dev gateway, signing keys, API keys) copied from
# cloud dev, grandiose-yak-969; every run sets SITE_URL to this checkout's URL,
# the one origin sign-in may return to. Until the settings are in, Convex
# holds the first push and retries it by itself.
#   usage: dev-seed.sh <cloud port> <app url>
set -eu
cloud="$1"
url="$2"

i=0
until curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$cloud/version"; do
	i=$((i + 1))
	[ "$i" -lt 60 ] || { echo "dev-seed: backend on :$cloud never came up" >&2; exit 1; }
	sleep 1
done

if ! npx convex env list 2>/dev/null | grep -q '^AUTH_JWKS='; then
	umask 077
	file="$(mktemp)"
	trap 'rm -f "$file"' EXIT
	npx convex env list --deployment grandiose-yak-969 | grep -v '^SITE_URL=' > "$file"
	npx convex env set --from-file "$file" > /dev/null
	echo "dev-seed: copied dev settings from grandiose-yak-969"
fi

if [ "$(npx convex env get SITE_URL 2>/dev/null)" != "$url" ]; then
	npx convex env set SITE_URL "$url" > /dev/null
	echo "dev-seed: SITE_URL=$url"
fi
