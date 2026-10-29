# onda-music

Album search over a mirror of MusicBrainz release groups (albums and EPs) in
D1, so search doesn't depend on musicbrainz.org's rate limits. Convex's album
provider (`convex/providers.ts`) calls `GET /search?q=` with a bearer token and
falls back to the MusicBrainz API if the mirror fails or finds nothing. Album
pages still fetch details from the API.

- Worker: `onda-music` at `https://onda-music.hello-fc8.workers.dev`
- D1: `onda-music` (`a85e0e6c-eb2e-4b65-9a11-3548e1d95e73`)

## Data

`import/run.sh` downloads the latest
[JSON dump](https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/)
(`release-group.tar.xz`, about 1.2 GB), keeps albums and EPs (about 2.9M), and
loads them into whichever of `albums_a` / `albums_b` isn't live, then flips
`meta.active`. The old slot stays until the next import, so rolling back is
`UPDATE meta SET value = 'albums_a' WHERE key = 'active'`.

Only CC0 core data is stored: id, title, artist credit, year, type. Tags,
genres and ratings are CC BY-NC-SA, so they only feed a numeric `boost`
(notability) and aren't stored. Rows are inserted most notable first, which is
what lets broad queries rank only their first 1000 matches.

`.github/workflows/music-import.yml` runs it weekly (and on demand, with
"force" to reload the same dump). It needs the repo secret
`CLOUDFLARE_D1_TOKEN`: an API token with **Account → D1 → Edit** on "Nate".

By hand: `pnpm import` (or `FORCE=1 pnpm import`), with wrangler logged in.

## Secrets

The same random token on both sides:

- Worker: `wrangler secret put SEARCH_TOKEN`
- Convex: `MUSIC_SEARCH_URL` and `MUSIC_SEARCH_TOKEN` on prod, cloud dev and
  the preview defaults (see `docs/deploy.md`). Unset means search uses the API.

## Deploy

`pnpm deploy` here. Not part of the app's Workers Builds.
