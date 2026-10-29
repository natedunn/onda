#!/usr/bin/env sh
# Loads the latest MusicBrainz release-group dump into the onda-music D1
# database. Builds the inactive table slot, then points `meta.active` at it, so
# the Worker switches over in one step. Skips the work if that dump is already
# loaded (FORCE=1 to reload). Run daily by .github/workflows/music-import.yml.
#   needs: curl, xz, tar, node 24+, wrangler auth (CLOUDFLARE_API_TOKEN in CI)
set -eu
cd "$(dirname "$0")/.."

base=https://data.metabrainz.org/pub/musicbrainz/data/json-dumps
db=onda-music
d1() { npx wrangler d1 execute "$db" --remote "$@"; }
value() { d1 --json --command "SELECT value FROM meta WHERE key = '$1'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].results[0]?.value??""))'; }

dump="$(curl -fsS "$base/LATEST")"
d1 --command "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)" > /dev/null
if [ "${FORCE:-}" != 1 ] && [ "$(value dump)" = "$dump" ]; then
	echo "import: $dump is already loaded"
	exit 0
fi
[ "$(value active)" = albums_a ] && target=albums_b || target=albums_a

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
echo "import: $dump into $target"
curl -fsS "$base/$dump/release-group.tar.xz" | xz -dc | tar -xOf - mbdump/release-group | node --max-old-space-size=4096 import/build.ts "$target" > "$work/albums.sql"
ls -lh "$work/albums.sql"

d1 --yes --file "$work/albums.sql"
d1 --command "INSERT INTO meta (key, value) VALUES ('active', '$target'), ('dump', '$dump') ON CONFLICT (key) DO UPDATE SET value = excluded.value"
echo "import: $target is live ($dump)"
