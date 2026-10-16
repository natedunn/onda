# onda∿

Lists of the movies, shows, books, albums and games you love. A from-scratch
rewrite of RAD (superrad.app).

**Stack:** TanStack Start (on Cloudflare Workers) · Convex · Convex Auth v2 (beta) ·
TanStack Query · Tailwind CSS v4.

## Develop

```sh
pnpm install
pnpm dev            # convex dev + vite on http://localhost:3030
```

First run against a fresh deployment:

```sh
npx convex dev --once                       # create/link a deployment, write .env.local
npx @convex-dev/auth                        # generate + set AUTH_PRIVATE_KEY / AUTH_JWKS
npx convex env set SITE_URL http://localhost:3030
npx convex env set AUTH_GITHUB_CLIENT_ID …  # GitHub OAuth app
npx convex env set AUTH_GITHUB_CLIENT_SECRET …
npx convex env set TMDB_API_KEY …           # optional: movies + shows
npx convex env set AUTH_DEV_GUEST true      # optional, dev only: guest sign-in button
```

The GitHub OAuth app's callback URL is `<CONVEX_SITE_URL>/oauth/github/callback`
(e.g. `https://<deployment>.convex.site/oauth/github/callback`), not the app's URL.

See `.env.example` for every variable.

## Layout

```
convex/
  schema.ts           users, lists, items, records (media cache), ogImages
  auth.ts             Convex Auth v2 setup: GitHub (+ dev-only guest)
  users.ts lists.ts items.ts
  media.ts            search: TMDB, Open Library, MusicBrainz/Cover Art Archive, IGDB
  og.ts ogRender.ts   OG images: satori + resvg in a Node action, cached in storage
  shared/             code shared with the frontend (themes, gradient, limits)
src/
  routes/             /, /sign-in, /@{username}, /settings, /l/{slug}, /l/{slug}/edit,
                      /og/l/{slug}.png, /auth/* (auth proxy)
  lib/convex-auth-start/  stopgap TanStack Start adapter for Convex Auth (see its README)
```

## Notes

- Media records are only ever written from server-side API fetches; the client
  adds items by record id.
- Item order uses fractional positions; `items.move` renumbers when gaps run out.
- A list's gradient is `meshGradient(theme, seed)`: plain CSS radial gradients,
  so the browser and the OG renderer draw the same thing.
