# onda∿

Lists of the movies, shows, books, albums and games you love. A from-scratch
rewrite of RAD (superrad.app).

**Stack:** TanStack Start (on Cloudflare Workers) · Convex · Convex Auth v2 (beta) ·
TanStack Query · Tailwind CSS v4.

## Develop

```sh
pnpm dev            # local Convex backend + the app at https://onda.localhost:1355
```

Works the same in any git worktree, each with its own URL and data; see
`docs/local-dev.md`. Deploys: `docs/deploy.md`. Sign-in setup:
`docs/auth-environments.md`.

## Layout

```
convex/
  schema.ts           users, lists, items, records (media cache), ogImages
  auth.ts             Convex Auth v2 setup: GitHub (+ dev-only guest)
  users.ts lists.ts items.ts
  providers.ts        source APIs: TMDB, Open Library, MusicBrainz/Cover Art Archive, IGDB
  media.ts            search + record cache upserts
  records.ts          public item pages; details fetched on first visit, refreshed every 30 days
  og.ts ogRender.ts   OG images: satori + resvg in a Node action, cached in storage
  shared/             code shared with the frontend (themes, gradient, limits)
src/
  routes/             /, /sign-in, /@{username}, /settings, /l/{slug}, /l/{slug}/edit,
                      /{kind}/{sourceId} (item pages, e.g. /movie/603),
                      /og/l/{slug}.png, /auth/* (auth proxy)
  lib/convex-auth-start/  stopgap TanStack Start adapter for Convex Auth (see its README)
```

## Notes

- Media records are only ever written from server-side API fetches; the client
  adds items by record id.
- Item order uses fractional positions; `items.move` renumbers when gaps run out.
- A list's gradient is `meshGradient(theme, seed)`: plain CSS radial gradients,
  so the browser and the OG renderer draw the same thing.
