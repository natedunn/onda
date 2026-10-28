# onda

Rewrite of RAD (superrad.app) — see README.md.

- pnpm. Tabs, double quotes, semicolons.
- Convex functions use plain `query`/`mutation`/`action` with `v` validators; no convex-helpers, no kitcn.
- Auth: `@convex-dev/auth@beta` (v2). Get the user with `getAuthUserId` / `requireUserId` (convex/users.ts).
- `src/lib/convex-auth-start/` is a temporary adapter — keep everything adapter-specific inside it
  (plus `src/routes/auth/*`, the tsconfig path and the vite alias) so it can be deleted when
  Convex ships official TanStack Start support.
- Data for pages: route `loader` + `ensureQueryData(convexQuery(...))`, components read with
  `useSuspenseQuery`. Writes: `useMutation` from `convex/react`.
- Design: left-aligned single column, paper/ink palette, Instrument Serif display, Verdana UI,
  underlined links, `.btn` with offset shadow, `fieldset.box` forms. Keep it minimal.
- Page content fills the layout column (`__root.tsx` sets the width). Don't add `max-w-*` to a page
  or copy one from a neighboring page; existing narrow caps are leftovers, not the pattern.
