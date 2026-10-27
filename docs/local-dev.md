# Local development

`pnpm dev` runs one checkout: its own local Convex backend and the app,
served through [Portless](https://github.com/vercel-labs/portless):

| Checkout | App | Convex backend |
|---|---|---|
| main (`~/Code/onda`) | `https://onda.localhost:1355` | `127.0.0.1:3210` / `3211` |
| any other worktree | `https://<folder>.onda.localhost:1355` | a pair in `20000`–`31999`, stable per worktree |

`<folder>` is the worktree's folder name, lowercased, with a leading `onda-`
dropped (`../onda-lists` → `lists.onda.localhost`). Each checkout keeps its own
data in `.convex/local/default/`, so worktrees never share a database. Run as
many as you like at once.

## A new worktree

```sh
git worktree add ../onda-lists -b lists
cd ../onda-lists && pnpm dev
```

That's all. On the first run `scripts/dev.sh` installs dependencies and
creates the local backend. Then `scripts/dev-seed.sh` copies the dev settings
from cloud dev (`grandiose-yak-969`): the "Onda Dev" OAuth apps, the dev
gateway, signing keys, `AUTH_DEV_GUEST`, TMDB and IGDB. Every run sets the
backend's `SITE_URL` to the checkout's URL. The first push waits for the
settings and goes through by itself a few seconds later.

Sign-in works in every checkout. Providers send everyone to
`gateway-dev.onda.club`, which forwards to whichever local backend started the
sign-in (it allows `http://127.0.0.1:*`), and that backend returns you to its
own `SITE_URL`.

## Changing dev settings

Set them on cloud dev, and new worktrees pick them up:

```sh
pbpaste | npx convex env set --deployment grandiose-yak-969 NAME
```

Existing checkouts keep what they were seeded with. Set it there too
(`npx convex env set NAME value` inside the checkout), or delete the
checkout's `.convex/local` to reseed, which also wipes its data.

## Notes

- Portless's proxy runs on port 1355, shared with other projects (Kino). It
  starts on its own and needs no sudo. If the browser warns about the
  certificate, run `portless trust` once.
- `scripts/dev.sh` writes the checkout's `CONVEX_DEPLOYMENT` and
  `VITE_CONVEX_*` into `.env.local` before starting anything; other lines are
  kept. (If Convex wrote them later, Vite would restart, and the Cloudflare
  plugin can crash on that restart.)
- A checkout's backend is recognised by its data folder (`--local-storage
  <checkout>/.convex/local/default/…` in its command line). `pnpm dev` stops
  one left behind by a crashed run, refuses to start if the checkout is
  already running elsewhere, and stops its backend when it exits.
- Removing a worktree (`git worktree remove`) removes its data with it.
