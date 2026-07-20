# ADR-0015: App-owned attendance (event check-in) in Postgres

**Status:** Accepted
**Date:** 2026-07-16

## Context

The church wants to record who checks in to events (Liturgy and Sunday School, run simultaneously at both campuses), produce attendance reports, and follow up with absentees — especially children/youth, by emailing their parents.

Subsplash's Events API (vendored `openapi.yaml`) exposes event CRUD (`/events/v2/calendars|events|repeating-events`), a `check_in_enabled` toggle, and a **read-only** `has_check_ins` flag ("updated via pubsub… Not available via sdk"). The `Session` and `AttendanceRes` schemas are stubs with no REST paths. **There is no endpoint to write a check-in or read per-person check-in records.** So attendance cannot live in Subsplash — it must be app-owned. Until now this repo has had no datastore of its own; it is a stateless RBAC-enforcing proxy over Subsplash (ADR-0004/0009).

## Decision

Add a small **Neon Postgres** database accessed via **Drizzle ORM**, holding two tables (`check_ins`, `devices`). People, households, and events stay in Subsplash — a check-in stores only the Subsplash `profile_id`, a display-name snapshot, and an `is_child` flag; events are still fetched/cached from Subsplash like profiles.

- **Neon + Drizzle.** The app deploys to Vercel serverless; Neon's HTTP driver (`@neondatabase/serverless`) makes each query a stateless HTTPS call, so there is no connection pool to exhaust across invocations. Drizzle is TS-first with plain-SQL migrations. Provisioned through the Vercel Neon Marketplace integration (injects `DATABASE_URL`).
- **Mock parity.** When `DATABASE_URL` is unset, `isDbConfigured()` is false and the attendance/device layers use an in-memory `globalThis` store seeded from `lib/mockData.ts` — mirroring `SUBSPLASH_USE_MOCK`, so local dev needs zero setup.
- **Occurrence key `(series_id, occurrence_date)`.** Subsplash materializes repeating occurrences as separate `Event` rows (`source: "repeating"`, `_embedded["repeating-event"]`), each with its own id. Keying attendance on the series id + the event-local calendar date makes "the last N Sundays" a simple `GROUP BY` and is robust to Subsplash re-materializing an occurrence under a new event id. A one-off event degenerates cleanly (`series_id = event_id`). The unique constraint `(series_id, occurrence_date, profile_id)` is one row per person per occurrence and doubles as double-tap protection.
- **Check-in and check-out on one row.** `checked_out_at`/`checked_out_by` record departure (Sunday School pickup); this is distinct from *undo* (deleting a mis-tap). Re-check-in after checkout clears `checked_out_at` (the person returned), keeping absentee math to one row per person.
- **Guests.** Walk-ins not in the directory are checked in by typed name as `is_guest` rows with a synthetic `guest:<uuid>` `profile_id` — no Subsplash profile required; they surface as a newcomer follow-up list.
- **Check-in window, server-enforced.** Check-in opens 45 min before `start_at`; check-out stays open until 45 min after `end_at`. `method: "backfill"` (staff/admin) bypasses the window for after-the-fact entry.

### RBAC (extends ADR-0005/0011/0014)

| Surface | Access |
|---|---|
| `GET /api/events*` | any authenticated (volunteers need the event picker) |
| `GET/POST/PATCH/DELETE /api/attendance` | any authenticated; volunteers gated per-record by `profileVisibleToVolunteer` (same predicate as the children directory); `backfill` is staff/admin only |
| `GET /api/attendance/report`, `/absentees`, `POST /api/attendance/email` | `requireStaffOrAdmin()` (aggregate/adult PII + send capability) |
| `GET/POST /api/devices`, `DELETE /api/devices/[id]` | `requireAdmin()` |
| `POST /api/kiosk/claim` | unauthenticated (single-use code, 15-min TTL, failed-attempt lockout) |
| `/api/kiosk/*` | valid device cookie **or** signed-in user, via `getAttendanceActor()` |

**Kiosk device actor.** Admins generate a one-time setup code; entering it on an iPad/phone (`/kiosk/setup`) exchanges it for a long-lived device token, stored only as a sha256 hash, delivered in an httpOnly+secure `kiosk_device` cookie. A device actor can list today's events, search the roster with a **names-only projection** (server strips phone/email/DOB/notes — not just UI hiding), and check in/out for the selected event. It can never reach `/api/profiles`, `/api/households`, reports, or email. Devices are revocable and expose `last_seen_at`.

## Consequences

- **Check-ins recorded here never surface inside Subsplash's own tools** (there is no write endpoint). This app becomes the system of record for attendance. Stakeholders must know check-in data lives only here.
- The repo gains its first datastore, migrations (`drizzle/`), and DB tooling that must run under Node 24 (the repo's default `node` is v10).
- A shared-iPad device token is a bearer credential. Mitigations: httpOnly+secure cookie, hash-only storage, admin revocation, `last_seen_at` visibility, names-only projection, kiosk-scoped endpoints. Residual risk: a stolen unlocked device can check people in/out (but not read the directory).
- Absentee/report queries join the app-owned attended set against the already-cached Subsplash profile walk (ADR-0009) in memory — no new Subsplash traffic.
- Retention: check-in rows of profiles later deleted in Subsplash are not auto-pruned; a periodic reconcile is a cheap follow-up.

## Alternatives rejected

- **Store attendance in Subsplash custom fields.** Abuses the People model, gives no per-occurrence history, and grows unbounded — unusable for reporting.
- **Vercel KV / Redis.** No relational `GROUP BY` for frequency and absentee queries.
- **Supabase.** Drags in an auth/storage platform the app doesn't need (NextAuth already handles auth); Neon is just Postgres.
- **A dedicated events table.** Events are Subsplash-owned; caching-on-read (ADR-0009 pattern) avoids a sync problem. Only attendance, which Subsplash can't hold, is stored locally.
