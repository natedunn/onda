# Auth environments — OAuth app setup

How sign-in is wired across environments, and exactly how to register each
OAuth app. See `docs/convex-auth.md` for the architecture and plan.

## Tiers

| Tier | Serves | Gateway | OAuth apps |
|---|---|---|---|
| Dev | local worktrees, preview deployments, Convex cloud dev | `https://gateway-dev.onda.club` | "Onda Dev" (one per provider) |
| Prod | onda.club + prod Convex | `https://gateway.onda.club` | "Onda" (one per provider) |

Every provider redirects to the tier gateway; the gateway forwards to the
Convex deployment that started the sign-in. So each OAuth app has exactly one
callback URL, and it never changes:

| Provider | Dev callback | Prod callback |
|---|---|---|
| GitHub | `https://gateway-dev.onda.club/oauth/github/callback` | `https://gateway.onda.club/oauth/github/callback` |
| Google | `https://gateway-dev.onda.club/oauth/google/callback` | `https://gateway.onda.club/oauth/google/callback` |
| Discord | `https://gateway-dev.onda.club/oauth/discord/callback` | `https://gateway.onda.club/oauth/discord/callback` |

What we request from each provider (set in code, not in the provider console):

| Provider | Scopes | Used for |
|---|---|---|
| GitHub | `read:user`, `user:email` | id, username, name, avatar, verified email |
| Google | `openid`, `email`, `profile` | id, name, avatar, verified email |
| Discord | `identify`, `email` | id, username, avatar, verified email |

We only use the provider's access token once, at sign-in, to read the profile.
We never store it or call the provider's API afterwards.

## GitHub (OAuth App)

Use an **OAuth App**, not a GitHub App: github.com → Settings → Developer
settings → **OAuth Apps** → **New OAuth App**. (If you see a "Permissions"
section, you're on the GitHub App form.) Create one for each tier.

| Field | Dev | Prod |
|---|---|---|
| Application name | `Onda Dev` | `Onda` |
| Homepage URL | `https://onda.club` | `https://onda.club` |
| Application description | optional, e.g. "Lists of the things you love." | same |
| Authorization callback URL | dev callback | prod callback |
| Wildcard matching (per callback URL, on the settings page) | **off** | **off** |
| Enable Device Flow | **off** | **off** |
| Expire user access tokens | leave the default (on) | same |

- There are no permissions to set: OAuth Apps get access through the scopes
  we request (`read:user`, `user:email`, both read-only).
- Only one callback URL per app. Don't add others.
- After registering: copy the **Client ID**, then **Generate a new client
  secret** and copy it immediately (shown once).
- Optional: upload a logo on the app's settings page (shown on the consent
  screen).

## Google (Google Auth Platform)

We only request `openid`, `email` and `profile`. Google treats those as basic
sign-in scopes: no API needs enabling, no scopes need configuring, and Google's
basic-scope exception means any Google account can sign in even while the app
is in **Testing** (no test-user list, no warning screen, no 7-day expiry).

1. **Project.** console.cloud.google.com → project picker → **New project** →
   name it `Onda`. Both tiers' clients live in this one project.
2. **Start the auth setup.** Search for **Google Auth Platform** (or APIs &
   Services → OAuth consent screen) → **Get started**. The wizard asks:
   - **App Information**: App name `Onda`; User support email: your address.
   - **Audience**: **External** (Internal is only for a Google Workspace org).
   - **Contact Information**: your email (Google's notices about the project).
   - **Finish**: agree to the Google API Services User Data Policy → **Create**.
3. **Create the dev client.** **Clients** → **Create client**:
   - Application type: **Web application**
   - Name: `Onda Dev` (only you see this)
   - Authorized JavaScript origins: leave empty
   - Authorized redirect URIs → **Add URI**:
     `https://gateway-dev.onda.club/oauth/google/callback`
   - **Create** → copy the **Client ID** and **Client secret** now (or
     **Download JSON**). The secret can't be viewed again later.
4. **Create the prod client.** Same again: Name `Onda Prod`, redirect URI
   `https://gateway.onda.club/oauth/google/callback`.
5. **Publish (when launching).** **Audience** → **Publish app** moves the
   project from Testing to In production. Not required for sign-in to work with
   our scopes, but it's the normal state for a live app.

Later, optional — **brand verification**: until it's done, Google won't show
the app name/logo on the consent screen. It needs a homepage on `onda.club`
that identifies the app, a privacy policy linked from that homepage and from
**Branding**, `onda.club` verified in Google Search Console, and `onda.club`
under **Branding → Authorized domains**. Do this once those pages exist.

## Discord (Developer Portal)

A Discord "application" is a bot/app container; we only use its OAuth2 part
for sign-in. Everything bot-related gets switched off. Do the steps in this
order: Discord refuses to make the bot private while an install link exists.

1. **Create** — discord.com/developers/applications → **New Application**.
   Name: `Onda Dev` (dev tier) or `Onda` (prod). The name is what users see on
   the consent screen ("Onda wants to access your account"). Agree to the
   terms → **Create**. It lands in your personal account. (Optional: create
   a **Team** first under Teams and create the app inside it, so it isn't tied
   to your personal account. Teams require 2FA on your account.)
2. **General Information**
   - **App Icon**: upload `onda-logo-512.png` (shown on the consent screen).
   - **Description**: optional, e.g. "Lists of the things you love."
   - **Tags**: leave empty.
   - **Interactions Endpoint URL**, **Linked Roles Verification URL**: leave
     empty.
   - **Terms of Service URL** / **Privacy Policy URL**: leave empty until
     `onda.club/terms` and `onda.club/privacy` exist; then fill in on the prod
     app (and dev, if you like).
   - **Save Changes**. Application ID = Client ID; ignore the Public Key.
3. **Installation** (sidebar) — no one should be able to "add" Onda anywhere.
   - **Install Link**: **None**. Save.
   - **Installation Contexts**: uncheck **User Install** and **Guild
     Install** if it lets you; if it insists on one, leave **Guild Install**
     — with no install link and a private bot it does nothing.
4. **Bot** (sidebar) — new apps get a bot user automatically. We don't use it.
   - **Public Bot**: **off** (only you could add it to a server). If it errors
     about an install link, step 3 wasn't saved.
   - **Requires OAuth2 Code Grant**: off.
   - **Presence / Server Members / Message Content Intent**: all off.
   - Don't **Reset Token**; we never need a bot token.
5. **OAuth2** (sidebar)
   - **Client ID**: copy it.
   - **Client Secret** → **Reset Secret** → copy it immediately (shown once;
     resetting again invalidates the old one).
   - **Redirects** → **Add Redirect** → the tier callback (exact match, no
     trailing slash):
     `https://gateway-dev.onda.club/oauth/discord/callback` (dev) or
     `https://gateway.onda.club/oauth/discord/callback` (prod). Only that one.
     **Save Changes** (the yellow bar at the bottom — easy to miss).
   - **Public Client**: **off**. We exchange the code server-side with the
     secret (plus PKCE); a public client is for apps that can't keep a secret.
   - **OAuth2 URL Generator**: ignore — we build the authorize URL in code
     (scopes `identify email`).
6. **Leave alone**: Emojis, Webhooks, Rich Presence, App Testers, Activities,
   Social SDK, Monetization, **App Verification** (that's for bots in 75+
   servers; sign-in apps don't need it).

What users can deny or lack, handled in code: a Discord account may have no
email (phone-only signup) or an unverified one (`verified: false`) — we only
link accounts by email when `verified` is true. Display name comes from
`global_name`, falling back to `username`; avatar from
`cdn.discordapp.com/avatars/<id>/<hash>.png`, or Discord's default avatar
when `avatar` is null.

## Credentials

Never commit or paste them. The Convex CLI targets the deployment in
`.env.local` (`CONVEX_DEPLOYMENT`), so name the deployment explicitly. Dev
credentials go on the shared cloud dev deployment (`grandiose-yak-969`); the
per-worktree setup copies them into local backends.

```sh
D=grandiose-yak-969
npx convex env set --deployment $D AUTH_GITHUB_CLIENT_ID …
npx convex env set --deployment $D AUTH_GITHUB_CLIENT_SECRET …
npx convex env set --deployment $D AUTH_GOOGLE_CLIENT_ID …
npx convex env set --deployment $D AUTH_GOOGLE_CLIENT_SECRET …
npx convex env set --deployment $D AUTH_DISCORD_CLIENT_ID …
npx convex env set --deployment $D AUTH_DISCORD_CLIENT_SECRET …
npx convex env list --deployment $D   # check
```

Prod credentials go on the prod deployment (`--prod`) once it exists; keep
them in the password manager until then. The gateways don't hold provider
credentials — only the tier routing secret.

## Before launch (Google)

Google stays in **Testing** until onda.club is live — sign-in still works for
any account because we only use basic scopes. To publish and get the name/logo
on the consent screen:

- [ ] onda.club serving the app, with `/privacy` and `/terms` pages
- [ ] Verify `onda.club` in Google Search Console
- [ ] Branding: home page `https://onda.club`, privacy `https://onda.club/privacy`,
      terms `https://onda.club/terms`, authorized domain `onda.club`, logo
      (`onda-logo-120.png`)
- [ ] Audience → **Publish app**; then brand verification in Verification Center
