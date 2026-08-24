# ADR-0022: Sync public Subsplash events to Google Calendar via a service account

**Status:** Accepted
**Date:** 2026-08-24

## Context

The church publishes its public-facing schedule (services, classes open to
the public, special events) in Subsplash. It also maintains a public Google
Calendar (`c_fd3fe8e6b60a91606fbba6c4a90e8b7050e3b207b07dcbca9c51bf6ec95dbe0f@group.calendar.google.com`)
that anyone can subscribe to, so the same information needs to reach both
places. This is a manual, admin-triggered push — Subsplash → Google, one way
— not a scheduled job and not two-way sync.

## Decision

- **Trigger:** a "Sync to Google Calendar" button on the Events page,
  admin-only (`requireAdmin`), calling `POST /api/events/sync-calendar`.
- **"Public"** means `status === "published" && visibility === "public"` for
  a one-off Subsplash event, or `visibility === "public" && published_at`
  for a repeating series (confirmed against the live org: a `RepeatingEvent`
  has no `status` field at all, unlike a materialized `Event` —
  `published_at` is the closest equivalent signal there).
- **A repeating series syncs as one native Google Calendar recurring event**,
  not one event per occurrence. Subsplash already exposes a series' schedule
  as raw RFC5545 lines (`RepeatingEvent.repetition_rules`:
  `DTSTART`/`RRULE`/`EXDATE`, already used by `lib/recurrence.ts` for
  occurrence expansion) — these map almost directly onto Google Calendar's
  own `recurrence` field (an array of RRULE/EXDATE/RDATE lines), with the
  `DTSTART` line dropped and expressed instead via the event's own `start`.
  This produces a normal-looking recurring entry in Google Calendar (one
  edit surface, correctly-cancelled single occurrences via EXDATE) instead
  of cluttering the calendar with an entry per Sunday.
- **Idempotent by construction, no id-mapping table:** the Google event id
  for a given Subsplash event/series id is a deterministic SHA-256 digest
  (`googleEventIdFor` in `lib/calendarSync.ts`) — hex output already
  satisfies Google's allowed id charset. A sync always tries to update that
  id first, falling back to create-with-that-id on a 404. Same pattern as
  `stableGuestId` in `lib/attendanceImport.ts`.
- **Stale events are pruned.** Every event this feature creates is tagged
  `extendedProperties.private = { source: "subsplash-sync", subsplashId }`.
  Pruning lists only events carrying that tag, diffs against the current
  public set, and deletes anything left over — so an event that's since been
  unpublished, made private, or deleted in Subsplash doesn't linger on the
  public calendar. The tag scope means pruning can never see, and therefore
  can never delete, an event a person added to the calendar by hand.
- **Auth: a Google service account**, not OAuth tied to a staff member's own
  session. A server-triggered button has no interactive consent flow to use,
  and a personal-token approach would inherit the exact session-fragility
  ADR-0021 already documented (a token that stops working when its owning
  browser session ends) for an entirely different reason — this integration
  doesn't share that risk at all, since it's a real, documented,
  service-account-friendly REST API, not an authenticated dashboard being
  driven by a browser. `lib/googleCalendarAuth.ts` hand-signs the JWT
  assertion with Node's built-in `crypto` (RS256) and exchanges it at
  Google's token endpoint — no `googleapis`/`google-auth-library` dependency,
  matching this codebase's existing "raw fetch, no SDK" convention for
  talking to Subsplash (`lib/subsplash.ts`, `lib/subsplashToken.ts`).
- **Setup the app can't do for itself:** a human with Google/GCP access must
  create the service account, enable the Calendar API, and share the target
  calendar with the service account's `client_email` ("Make changes to
  events"), then set `GOOGLE_CALENDAR_ID` / `GOOGLE_CALENDAR_CLIENT_EMAIL` /
  `GOOGLE_CALENDAR_PRIVATE_KEY` directly (never pasted through chat/an
  agent). Until then, `GOOGLE_CALENDAR_USE_MOCK=true` (default) fakes every
  Calendar API call against an in-memory store, mirroring
  `SUBSPLASH_USE_MOCK` — so the button, route, and `calendar_syncs` logging
  are all fully exercisable before real credentials exist.
- **`calendar_syncs`** table (mirrors `attendance_imports`): one row per
  sync attempt — `ranAt`, `eventsSeen`, `eventsCreated`, `eventsUpdated`,
  `eventsDeleted`, `error` — feeding the Events page's status line.

## Consequences

- One-way only: an edit made directly on the Google Calendar event is not
  reflected back into Subsplash, and gets silently overwritten by the next
  sync (since the sync always re-asserts Subsplash's current state onto the
  same deterministic event id). Acceptable — Subsplash is the source of
  truth for this data; the calendar is a read-only mirror for the public.
- No location on synced events (v1): Subsplash's `Event.location` is only an
  id reference requiring a separate Locations fetch this feature doesn't do
  yet. Title, time, and description are enough value to start with.
- Sync freshness is only as good as the last manual click — there's no
  schedule. Acceptable per the explicit ask: a button, not automation.
- Reading `visibility`/`description_text`/`repetition_rules` for *all*
  events (not just `check_in_enabled` ones) required a fetch path of its own
  in `lib/calendarSync.ts`, independent of `lib/events.ts`'s `listEvents`
  (which hard-filters to `check_in_enabled`) and without extending the
  shared `AppEvent` type — kept isolated since nothing else in the app needs
  these fields.

## Alternatives rejected

- **OAuth as a staff member's own Google account.** Ties the integration to
  one person's session/credentials and needs a full interactive consent
  flow with no natural trigger point from a server-side button. A service
  account is the standard, non-fragile mechanism for exactly this
  (server-to-server writes to one shared calendar).
- **One Google Calendar event per occurrence.** Simpler to build, but
  clutters the calendar with dozens of near-identical entries per series and
  makes each one independently editable/deletable in Google Calendar, unlike
  a real recurring event.
- **Never pruning stale events.** Simpler and can never surprise-delete
  anything, but an event pulled or hidden in Subsplash would then sit on the
  *public* calendar forever unless someone remembered to remove it by hand —
  worse than the (safely-scoped, tag-based) pruning this ADR chose instead.
- **`googleapis` / `google-auth-library`.** Would work, but pulls in a large
  dependency for what's a small, well-documented REST surface — this
  codebase already prefers hand-rolled `fetch` + a cached OAuth token for
  Subsplash, so the same approach was used here for consistency.
