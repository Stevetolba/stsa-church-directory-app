# ADR-0002: Roles live in the app, not the Subsplash token

**Status:** Accepted
**Date:** 2026-07-09

## Context

The original tech spec derived `admin` vs `staff` from Subsplash JWT claims. That token describes the API client (the app), not the person signed in — it cannot carry per-user roles. Roles must be resolved independently of Subsplash, after Google confirms identity (ADR-0001).

## Decision

Maintain a staff-role map in the app, seeded from a known admin email list. On login, resolve the signed-in email against the map: emails on the admin list get `admin`; every other valid church-domain account defaults to `staff` (view-only).

Implementation for v1 — `lib/roles.ts`, server-only, reading from an environment variable so the list isn't committed to the repo:

```typescript
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export function resolveRole(email: string): 'admin' | 'staff' {
  return ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'staff';
}
```

`ADMIN_EMAILS` is set in `.env.local` and in the Vercel project's environment variables — never committed.

## Consequences

- Adding/removing an admin is an env-var change + redeploy — acceptable for a small, rarely-changing staff.
- The admin list's location (`ADMIN_EMAILS`) is the authored source of truth — it must not drift into someone's memory or a Slack thread.
- If the admin list grows large or changes often, graduate to a Google Group (e.g. `church-directory-admins@church.org`) checked via the Google Directory API. Noted as a future ADR, not a v1 need.

## Alternatives rejected

- **Roles from Subsplash JWT claims** (original spec). Not possible — the Subsplash token has no per-user concept (ADR-0001).
- **A database-backed roles table from day one.** Overkill for a handful of admins on a small staff; env-var config is simpler and sufficient until the Google Group graduation point above is reached.
