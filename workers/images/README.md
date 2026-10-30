# onda-images

Item art lives in the R2 bucket `onda-images`, served publicly at
`https://img.onda.club` (the bucket's custom domain, cached at the edge for a
year). This Worker is the only way in: Convex (`convex/images.ts`) sends
`PUT /objects/<key>` with a bearer token, and the Worker writes the file with
its content type and an immutable cache header. Reads never touch it.

- Worker: `onda-images` at `https://onda-images.hello-fc8.workers.dev`
- Bucket: `onda-images`, custom domain `img.onda.club`

## What gets stored

Records store an image pointer, not a URL (`convex/shared/images.ts`):

- `{ host: "tmdb", id }`: posters stay on TMDB's CDN.
- `{ host: "igdb" | "caa" | "openlibrary", id }`: copied to R2 once the
  record is on a list, two sizes each, then replaced by
- `{ host: "r2", files, from }`: our copy; `from` is the source image, so a
  refresh that still points there keeps the copy.

Keys are `<kind>/<sourceId>/<content hash>-<width>.<ext>`, so a new picture
gets new URLs and nothing is ever overwritten. `pinned: true` (set through
`images:setImage`) keeps an image chosen by hand across source refreshes.

## Secrets

The same random token on both sides:

- Worker: `wrangler secret put UPLOAD_TOKEN`
- Convex: `IMAGES_UPLOAD_URL` and `IMAGES_UPLOAD_TOKEN` on prod, cloud dev and
  the preview defaults (see `docs/deploy.md`). Unset means records keep
  pointing at the sources' own image hosts.

## Deploy

`pnpm deploy` here. Not part of the app's Workers Builds.
