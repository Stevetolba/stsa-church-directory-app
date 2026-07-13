# Deployment — Vercel + real Subsplash

Production runs on **Vercel** against the **real Subsplash API**. This is the
runbook for a first production cut and for routine redeploys.

## 1. Google OAuth (one-time)

In the Google Cloud console for the OAuth client used by `AUTH_GOOGLE_ID`:

- Add the production redirect URI: `https://<your-domain>/api/auth/callback/google`
- Keep the app restricted to the church Google Workspace. Domain enforcement is
  also done in code (`lib/auth.ts` checks the `hd` claim **and** the verified
  email suffix against `CHURCH_GOOGLE_WORKSPACE_DOMAIN`).

## 2. Vercel project

- Import the repo into Vercel. Framework is auto-detected as Next.js; the
  default `build`/`start` commands are correct — no `vercel.json` needed.
- Set the environment variables below in **Project → Settings → Environment
  Variables** (Production scope). Set secret values in the dashboard — they are
  never committed.

| Variable | Value |
| --- | --- |
| `SUBSPLASH_USE_MOCK` | `false` (serves real Subsplash instead of mock fixtures) |
| `SUBSPLASH_BASE_URL` | `https://core.subsplash.com` |
| `SUBSPLASH_ORG_KEY` | org key (real) |
| `SUBSPLASH_CLIENT_ID` | service client id (real) |
| `SUBSPLASH_CLIENT_SECRET` | service client secret (real) |
| `AUTH_SECRET` | freshly generated, e.g. `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | Google OAuth client id |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `CHURCH_GOOGLE_WORKSPACE_DOMAIN` | the church Workspace domain |
| `ADMIN_EMAILS` | comma-separated admin emails (`lib/roles.ts`) |
| `NEXT_PUBLIC_APP_NAME` | display name, e.g. `STSA Church Directory` |

`AUTH_TRUST_HOST` is **not** required on Vercel (auto-detected). It **is**
required for any non-Vercel host or a local `next start` — otherwise every page
returns `UntrustedHost` (see `.env.example`).

## 3. Deploy → verify → promote

1. Push a branch / open a PR → CI (`.github/workflows/ci.yml`) runs lint + build.
2. Let Vercel build a **Preview** deployment.
3. On the preview URL, smoke test:
   - Sign in with a real Workspace account; confirm a non-Workspace account is rejected.
   - People and Households load from real Subsplash.
   - As an admin, edit a profile's **campus** and a household's **address**
     (street/city/state/postal) and confirm the changes persist. These are the
     two paths that only exercise against the live API.
   - Confirm a staff (non-admin) session is read-only (edit routes return 403).
4. Promote to **Production** and attach the custom domain.
5. Installability: on the deployed domain the PWA service worker registers
   (disabled in dev by design). Confirm "Add to Home Screen" is offered and the
   offline fallback (`/offline`) shows when disconnected.

## Known operational notes

- **Cold-start latency (real data).** The Subsplash client walks *all* profile
  and household pages into an in-memory TTL cache (`lib/subsplash.ts`,
  ADR-0004/0009). On Vercel this cache is **per-lambda and cold after each new
  instance**, so the first request to a fresh instance pays the full walk. If
  this is painful in practice, options are a longer TTL or a warmup ping; not a
  launch blocker.
- **Campus write depends on observed data.** Subsplash exposes no
  custom-field-definitions endpoint, so `updateProfile` learns the Campus
  field's definition/revision and dropdown choice ids from real profiles
  (`buildCampusFieldInput`). If a campus value has never appeared on any
  profile, setting it returns HTTP 422 with a clear message rather than a bad
  write.
