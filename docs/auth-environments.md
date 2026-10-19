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

console.cloud.google.com → create a project **Onda** (both tiers' clients can
live in it). Then open **Google Auth Platform** (APIs & Services → OAuth
consent screen redirects there).

**Branding** (shared by both clients)
- App name: `Onda`
- User support email: yours
- App logo: optional. Uploading one requires Google to verify the brand
  before it's shown; skip it until launch.
- App domain → Application home page: `https://onda.club`; privacy policy and
  terms links: add when those pages exist (needed for brand verification).
- Authorized domains: `onda.club`
- Developer contact email: yours

**Audience**
- User type: **External**
- Publishing status: starts in **Testing** — only listed **Test users** can
  sign in (add your own Google accounts). Click **Publish app** when ready for
  real users; with only non-sensitive scopes, publishing doesn't need Google's
  app verification.

**Data Access** → Add or remove scopes: `openid`,
`.../auth/userinfo.email`, `.../auth/userinfo.profile`. Nothing else.

**Clients** → Create client, once per tier:

| Field | Dev | Prod |
|---|---|---|
| Application type | Web application | Web application |
| Name | `Onda Dev` | `Onda Prod` |
| Authorized JavaScript origins | leave empty | leave empty |
| Authorized redirect URIs | dev callback | prod callback |

Copy the Client ID and **Client secret** when the dialog shows them (or
download the JSON) — newer projects only show the secret at creation.

## Discord (Developer Portal)

discord.com/developers/applications → **New Application**, once per tier:
`Onda Dev` and `Onda`. The name is what users see on the consent screen.

**General Information**: app icon and description optional (shown on the
consent screen). Terms/privacy URLs: add when those pages exist. Leave
Interactions Endpoint URL, Linked Roles and the rest empty.

**OAuth2**
- Copy the **Client ID**; **Reset Secret** and copy the **Client Secret**.
- **Redirects** → Add Redirect: the tier callback. Save changes.
- **Public Client**: **off** (we use the secret server-side).
- Ignore the OAuth2 URL Generator — we build the URL in code.

**Installation**: we only use Discord for sign-in, not as a bot.
- Install Link: **None**
- Installation contexts: uncheck both (User Install, Guild Install) if the
  portal allows it.

**Bot**: if the app has a bot user, turn **Public Bot** off (so nobody can add
it to a server) and leave Privileged Gateway Intents off. Don't create a bot
token.

## Credentials

Never commit or paste them. Dev credentials go on the Convex dev deployment:

```sh
npx convex env set AUTH_GITHUB_CLIENT_ID …
npx convex env set AUTH_GITHUB_CLIENT_SECRET …
npx convex env set AUTH_GOOGLE_CLIENT_ID …
npx convex env set AUTH_GOOGLE_CLIENT_SECRET …
npx convex env set AUTH_DISCORD_CLIENT_ID …
npx convex env set AUTH_DISCORD_CLIENT_SECRET …
```

Prod credentials go on the prod deployment (`--prod`) once it exists; keep
them in the password manager until then. The gateways don't hold provider
credentials — only the tier routing secret.
