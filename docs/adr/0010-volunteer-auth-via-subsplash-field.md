# ADR-0010: Volunteers sign in with a personal Google account, authorized via a Subsplash custom field

**Status:** Accepted
**Date:** 2026-07-12

## Context

ADR-0001 restricts sign-in to the church's Google Workspace domain, which is correct for staff but excludes volunteers — they don't have church-issued Workspace accounts and sign in with personal Google accounts instead. Domain-checking (`hd` claim + email suffix) can't distinguish an approved volunteer's personal Gmail address from anyone else's; some other signal is needed to decide who gets in.

## Decision

Extend `signIn` (`lib/auth.ts`) so a non-Workspace Google account is allowed through if the sign-in email matches a Subsplash profile with a custom field (name configurable via `SUBSPLASH_ACCESS_FIELD_NAME`, default `DirectoryAccess`) set to `"Yes"` — see `hasVolunteerDirectoryAccess()` in `lib/subsplash.ts`. Access is granted per-person directly in Subsplash rather than via a second app-side allowlist, so the same team that manages membership data manages who can sign in — no separate list to keep in sync.

Role resolution (`lib/roles.ts`, ADR-0002) gets a third value, `"volunteer"`: admin (via `ADMIN_EMAILS`) takes priority, then Workspace-domain accounts are `"staff"`, and anything else — which by this point has already passed the `signIn` check — is `"volunteer"`. Volunteers get the same view-only access as staff; there's no permission difference today (`lib/rbac.ts`'s `requireAdmin()` is unaffected by the new role).

## Consequences

- `lib/auth.ts`'s `signIn` callback now calls into `lib/subsplash.ts`, a new dependency for the auth layer. This is safe because the Google provider (and thus this callback) only loads in the Node runtime (see `auth.config.ts`'s Edge/Node split) — no Edge-incompatible code is introduced.
- Sign-in for a personal account costs one profile lookup against the (cached, per ADR-0009) profiles list. Same cold-cache cost as any other first request after a TTL expiry or restart.
- `types/auth.ts`'s `Role` is `"admin" | "staff" | "volunteer"`. Anywhere a `Role` is displayed or switched on (e.g. `components/Sidebar.tsx`'s `ROLE_LABEL`) needs the third case.

## Alternatives rejected

- **A second app-side allowlist** (`VOLUNTEER_EMAILS` env var, mirroring `ADMIN_EMAILS`). Simpler to implement, but creates a list that has to be manually kept in sync with who's actually an active volunteer — Subsplash already has via a custom field.
- **Open to any Google account.** No allowlist or field check at all. Rejected — this app serves member PII (addresses, phone numbers, birthdates), so anonymous self-service sign-up is an unacceptable exposure.
