# ADR-0016: Access audit log (sign-ins and directory reads) in Postgres

**Status:** Accepted
**Date:** 2026-07-21

## Context

The directory holds member PII (addresses, phone numbers, birthdates, allergy/care notes). Admins asked to be able to see who's signed in and who's read the directory — both as a light security-monitoring signal (repeated denied sign-in attempts) and as basic accountability for who looked at what. There was no existing audit trail of any kind; sign-in decisions (`lib/auth.ts`) and directory reads (`lib/rbac.ts`'s `requireStaffOrAdmin()`, `/api/children`) happened without leaving any record. ADR-0015 had already added a Neon Postgres database (via Drizzle) for attendance, so a datastore for this no longer requires new infrastructure.

## Decision

A new `access_events` table (`lib/db/schema.ts`), same Neon/Drizzle setup as `check_ins`/`devices`, with mock-mode parity via an in-memory `globalThis` array when `DATABASE_URL` is unset (mirrors ADR-0015's `isDbConfigured()` pattern). All reads/writes go through a new `lib/accessLog.ts` (`recordAccessEvent`, `listAccessEvents`).

**What's logged**, one row per event: `email`, `role` (resolved via `lib/roles.ts`'s `resolveRole`, even for a denial — it only classifies the email's shape, not whether access was granted), `eventType` (`sign_in` | `sign_in_denied` | `directory_read`), and `resource` (a short label for what was read, e.g. `"profiles"`, `"attendance-report"` — null for sign-in events).

- **Sign-ins.** `lib/auth.ts`'s `signIn` callback logs every branch that reaches a real allow/deny decision — admin, workspace-staff, and volunteer (both granted and denied via `hasDirectoryAccess`). The one branch left unlogged is a missing/unverified email, since there's no reliable identity to attribute it to (the callback already refuses to trust an unverified email as an identity key at all).
- **Directory reads.** `requireStaffOrAdmin()` (`lib/rbac.ts`) is the one function nearly every PII-serving *read* route already calls (profiles, households, attendance report/absentees/email, children email) — never mutations, those go through `requireAdmin()` instead. It now takes a caller-supplied `resource` label and logs a `directory_read` event on the passing path, right where the session is already being checked. `/api/children` is instrumented directly (it deliberately doesn't use `requireStaffOrAdmin`, since volunteers are allowed there) rather than through the shared helper.
- **Granularity.** Logging stops at "which directory surface was read" (list/report level), not "whose individual profile was opened" — the two detail-page server components (`people/[id]`, `households/[id]`) call `auth()` directly rather than through `rbac.ts` and were deliberately left uninstrumented. Adding per-profile view logging would mean touching those pages individually; out of scope unless a real need for that finer granularity shows up.
- **Best-effort, never blocking.** `recordAccessEvent` swallows and `console.error`s any failure. An audit-log outage (or a misconfigured `DATABASE_URL`) must never turn into a broken sign-in or a broken directory page — it's a trail, not a gate.
- **Viewing it.** A new admin-only Activity Log page (`/settings/activity`, mirroring `/settings/devices`'s page-redirect + `requireAdmin()`-gated API pattern) lists the most recent 200 events (capped at 500), newest first, via `GET /api/access-events`.

## Consequences

- One more table alongside `check_ins`/`devices`; same migration workflow (`drizzle-kit generate`/`migrate` under Node 24).
- `requireStaffOrAdmin()`'s signature changed (now takes a `resource: string`) — every one of its seven call sites was updated to pass a short label.
- This is an at-a-glance trail, not a compliance archive: no pagination beyond the most-recent window, no export, no retention policy. Add one later if a real need for it shows up.
- Denied sign-in attempts are logged with the email Google reported — acceptable since it's the same email the person themselves typed into Google's sign-in screen, not scraped from anywhere.

## Alternatives rejected

- **Logging inside `requireAdmin()` too** (mutations, device management): rejected for now — the ask was specifically about *reading* the directory, and folding writes in would blur "who viewed what" with "who changed what," which deserves its own (unstarted) audit trail if it's ever needed.
- **Per-profile-view logging** (instrumenting `people/[id]`/`households/[id]` directly): more precise, but a bigger lift for a finer grain than was asked for. Left out; straightforward to add later following the same `recordAccessEvent` call pattern.
- **A third-party logging/analytics service** instead of a Postgres table: rejected — the app already has a database doing the exact same job for attendance, and an audit log this small doesn't need anything more specialized.
