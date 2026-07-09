# ADR-0005: RBAC is server-enforced, because the app is the only guard

**Status:** Accepted
**Date:** 2026-07-09

## Context

The Subsplash org credential (the cached service token from ADR-0003) can `PATCH` any profile — the Subsplash API has no concept of the individual staffer making the request, so it cannot tell a "view-only" staffer's request from an admin's. This app is the sole thing preventing an unauthorized edit from reaching Subsplash.

## Decision

Enforce the admin check in the API route handler itself, not just the UI. Hiding the Edit button client-side is UX, not security. `PATCH /api/profiles/[id]` independently verifies the session role is `admin` (via `lib/rbac.ts`'s `requireAdmin()` guard) and returns `403` otherwise — regardless of what the client sent or what the UI showed.

Two-layer guard:
1. UI hides edit affordances for non-admin sessions.
2. The write route rejects non-admin sessions server-side, unconditionally.

## Consequences

- Every write route must call `requireAdmin()` before touching Subsplash — this is not optional and should be treated as a required step whenever a new mutating endpoint is added.
- Needs at least one integration test asserting a `staff`-role session gets `403` on `PATCH /api/profiles/[id]`.

## Alternatives rejected

- **UI-only guard** (hide the Edit button for non-admins, trust the client). Rejected outright — a non-admin could still call the route handler directly with a valid session and edit a profile, since the Subsplash service token doesn't distinguish staffers.
