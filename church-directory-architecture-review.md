# Church Directory — Architecture Review & ADRs
> Solution architect pass over the web spec, grounded in the actual Subsplash `openapi.yaml`.
> Read this **before** Claude Code starts building. It supersedes the auth sections of the tech spec where they conflict.

---

## Executive summary

The spec is ~85% build-ready. One critical correction and four decisions must be resolved first. The single most important finding: **Subsplash auth is machine-to-machine (`client_credentials`), not per-user login.** This means the app needs its own staff authentication layer, and roles cannot come from the Subsplash token. Everything else is refinement.

| # | Finding | Severity | Section |
|---|---|---|---|
| 1 | Subsplash auth is `client_credentials`, not user login | 🔴 Critical | ADR-001 |
| 2 | Roles must live in app's own user store, not Subsplash JWT | 🔴 Critical | ADR-002 |
| 3 | No refresh token — backend caches & re-mints service token | 🟡 Important | ADR-003 |
| 4 | Push search/filter/pagination to the API (server-side) | 🟡 Important | ADR-004 |
| 5 | App is the *only* guard on member data — RBAC must be server-enforced | 🟡 Important | ADR-005 |
| 6 | Folder structure needs auth + token-cache modules | 🟢 Minor | §Folder |

---

## ADR-001 — Staff authentication is separate from Subsplash

**Context.** `POST /tokens/v1/token` takes `grant_type=client_credentials` + `client_id` + `client_secret` and returns an org-scoped access token. It has no concept of an individual user logging in. The spec's assumption that staff authenticate with Subsplash credentials is incorrect.

**Decision.** Build a dedicated **staff authentication layer** in the app, independent of Subsplash. The Subsplash token is a backend-only service credential used for *all* API calls regardless of which staffer is signed in.

**Options considered.**
- **A — Google Workspace SSO (recommended if the church uses Google).** Restrict sign-in to the church's Google domain. Zero password management, familiar to staff, fast to implement with NextAuth/Auth.js.
- **B — Email + password with an invite-only user store.** Full control, but you own password resets, hashing, and security. More work, more risk.
- **C — A managed auth provider** (Clerk, Auth0, Supabase Auth). Fast, secure, generous free tiers; one more vendor.

**DECISION (LOCKED): Option A — Google Workspace SSO.** The church runs on Google Workspace. Staff sign in with their existing Google church account via **Auth.js (NextAuth v5) with the Google provider**. Sign-in is restricted to the church's Workspace domain (`hd` claim check) so only church accounts can authenticate.

**Implementation notes.**
- Use `next-auth@beta` (Auth.js v5) with the Google provider.
- Create OAuth credentials in Google Cloud Console (Client ID + Secret) for the church's Workspace.
- In the `signIn` callback, verify the Google `hd` (hosted domain) claim equals the church domain — reject anyone outside it. (Note: `hd` is convenient but spoofable in theory; for hardening, also check the email against the known-staff list.)
- No password management, no reset flows — Google owns all of it.

**Consequences.** Adds `next-auth` as a dependency (Tier 2 — this ADR is its approval). The `/login` screen becomes a single "Sign in with Google" button instead of an email/password form — **update the mockup accordingly** (it's a simpler screen, so this is a subtraction, not extra work).

---

## ADR-002 — Roles live in the app, not the Subsplash token

**Context.** The spec derives `admin` vs `staff` from Subsplash JWT claims. That token describes the API client, not the person — so it can't carry per-user roles.

**DECISION (LOCKED).** Maintain a **staff-role map in the app**, seeded from the known admin email list. On login (after Google verifies identity), resolve the signed-in email against the map: emails on the admin list get `admin`; every other valid church-domain account gets `staff` by default.

**Implementation for v1.** Store the admin emails in a server-side config module (`lib/roles.ts`), read from an environment variable so the list isn't committed to the repo:

```typescript
// lib/roles.ts  — server only
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export function resolveRole(email: string): 'admin' | 'staff' {
  return ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'staff';
}
```

Set `ADMIN_EMAILS` in `.env.local` and in Vercel's environment variables:
```
ADMIN_EMAILS=pastor@church.org,office@church.org,admin@church.org
```

**Consequences.** Adding/removing an admin is an env-var change + redeploy (seconds on Vercel) — fine for a small, rarely-changing staff. If the admin list becomes large or changes often, graduate to a **Google Group** (`church-directory-admins@church.org`) and check group membership via the Google Directory API — note this as a future ADR, not a v1 need. Document the current admin list location as authored truth so it doesn't drift into someone's memory.

---

## ADR-003 — Service token caching & refresh

**Context.** The token response includes `expires_in` (seconds) and `token_type`, but **no refresh token**. Re-minting on every request is wasteful and rate-limit-risky.

**Decision.** Cache the service token **server-side in memory**, keyed by nothing (there's one). Re-mint via `client_credentials` when it's within ~60s of expiry. Wrap this in a single `getServiceToken()` used by the Subsplash client.

**Consequences.** On serverless (Vercel), memory isn't shared across invocations, so each cold instance mints its own token — acceptable, but if Subsplash rate-limits token creation, move the cache to a short-TTL KV store (Vercel KV / Upstash). Note this as a scaling follow-up, not a v1 blocker.

---

## ADR-004 — Server-side search, filter & pagination

**Context.** The profiles endpoint exposes rich JSON:API params: `filter[first_name]`, `filter[last_name]`, `filter[status]`, `filter[email]`, `filter[phone]`, plus `sort`, `fields[...]`, and `page`. The spec's "fetch then filter" is fine for tiny data but breaks at scale.

**Decision.** Push all search, filtering, sorting, and pagination **to the API**. The member-list route handler forwards query params through to Subsplash and returns one page at a time. Debounce search input 300ms client-side.

**Consequences.** The `useMembers` hook takes `{ search, status, page }` and builds the query string. Faster first paint, no giant client-side arrays, works for a 5-member church or a 50,000-member one. Use `fields[profiles]=...` (sparse fieldsets) on the list view to fetch only what the card shows.

---

## ADR-005 — RBAC is server-enforced, because the app is the only guard

**Context.** The Subsplash org credential can PATCH any profile — the API does not know or care that a "view-only" staffer triggered the request. **Your app is the sole thing preventing an unauthorized edit.**

**Decision.** Enforce the admin check **in the API route handler**, not just the UI. Hiding the Edit button (client-side) is UX, not security. The `PATCH /api/profiles/[id]` handler must independently verify the session role is `admin` and return 403 otherwise.

**Consequences.** Two-layer guard: (1) UI hides edit affordances for non-admins; (2) the write route rejects non-admin sessions server-side regardless of UI. Add one integration test that a `staff`-role session gets 403 on PATCH.

---

## Revised auth flow (replaces spec §4)

```
Staff → /login → [SSO provider or hosted login]
        ↓ (provider verifies identity, restricted to church domain)
     App session created (httpOnly cookie), role resolved from role-map
        ↓
Staff uses app → calls /api/profiles etc.
        ↓
Route handler: (1) checks app session valid
               (2) checks role for writes
               (3) calls Subsplash with cached SERVICE token
        ↓
Subsplash API (org credential — never exposed to browser)
```

Two independent token concepts, never conflated:
- **App session** — proves *who the staffer is* and *their role*. Lives in an httpOnly cookie.
- **Subsplash service token** — proves *the app* may call Subsplash. Lives server-side only, cached & re-minted.

---

## Revised folder additions (deltas to spec §5)

```
lib/
├── subsplash.ts          # (existing) API client — now uses getServiceToken()
├── subsplashToken.ts     # NEW — mint/cache/refresh the client_credentials token
├── auth.ts               # NEW — session helpers, role resolution
└── rbac.ts               # NEW — requireAdmin() guard for route handlers
app/api/
└── auth/
    └── [...provider]/route.ts   # NEW — auth provider callback (NextAuth/Clerk)
stores/
└── authStore.ts          # (existing) — now holds app-session user + role
```

The old `/api/auth/login` + `/api/auth/logout` hand-rolled routes are replaced by the provider's routes (ADR-001).

---

## What's already right in the spec (keep as-is)

- Server-side API proxy pattern (never call Subsplash from the browser) ✅
- httpOnly cookies for the session ✅
- Next.js middleware for route protection ✅
- Server-side role guard concept ✅ (now made mandatory in ADR-005)
- TypeScript types for Profile/Household ✅
- Build order & mock-data-first approach ✅

---

## Decisions — RESOLVED ✅

1. **Auth provider:** Google Workspace SSO via Auth.js (NextAuth v5), domain-restricted. ✅ (ADR-001)
2. **Admin list:** Seeded from the church's admin email list, stored in the `ADMIN_EMAILS` env var, resolved by `lib/roles.ts`. ✅ (ADR-002)
3. **Token rate-limit:** Start with in-memory service-token cache; revisit Vercel KV only if 429s appear. ✅ (ADR-003)

**Architecture is fully locked. Claude Code can build straight from the spec + this review.**

---

## Handoff prompt for Claude Code

> I'm building a staff-only church directory web app in Next.js 14. I have three docs: the tech spec, this architecture review with ADRs, and mockup screenshots. **The architecture review overrides the spec's auth sections.** Use Sonnet to build step by step from the spec's build order, with these corrections applied: (1) staff auth via **Google Workspace SSO using Auth.js (NextAuth v5), domain-restricted to the church**, separate from Subsplash; (2) roles resolved from an `ADMIN_EMAILS` env var via `lib/roles.ts` (admins listed there, everyone else on the church domain is view-only staff); (3) a cached server-side Subsplash service token minted via `client_credentials`; (4) server-side search/filter/pagination forwarded to the Subsplash API; (5) the admin check enforced in the PATCH route handler with a 403 for non-admins, not just the UI. Start with Step 1: project scaffold. Build with mock data first, wire the real Subsplash API last.
