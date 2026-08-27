# ADR-0022: Sync public Subsplash events to Google Calendar

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
- **Scoped to three of the four Subsplash calendars.** Confirmed against the
  live org's `/events/v2/calendars`: this org has 4 calendars ("Upcoming
  Events", "Service Schedule", "Children & Youth Calendar", "Community
  Impact Events"). Synced: Service Schedule (subtitle "Liturgy, Vespers,
  Confession, Sunday School, The Well..."), Upcoming Events (general parish
  events), and Community Impact Events (outreach). "Children & Youth
  Calendar" is deliberately excluded — not requested. `belongsToSyncedCalendar`
  in `lib/calendarSync.ts` checks each event/series' embedded `calendars`
  (fetched via `include=calendars`) against the pinned set of calendar ids.
  Combined with the existing prune-stale-events behavior, narrowing this
  filter automatically removes anything already synced from a calendar
  that's since fallen outside the set on the next run — no separate cleanup
  step was needed.
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
- **Auth: OAuth 2.0 with a refresh token**, for one specific Google account
  chosen to own the calendar edits — not tied to any staff member's browser
  session, and not a service-account key either. The original design used a
  service-account key (see "Alternatives rejected"), but this org's GCP
  policy (`iam.disableServiceAccountKeyCreation`, part of Google's "Secure
  by Default" org-level enforcement) blocks creating one at all — confirmed
  hitting this directly when setting up the real credentials. A refresh
  token isn't a service-account key, so it sidesteps that policy entirely,
  and unlike ADR-0021's session-fragility problem (a browser-session token
  that stops working when the browser/session ends), a Google OAuth refresh
  token is decoupled from any browser session once minted — it persists
  until explicitly revoked, six months of inactivity, or its OAuth client's
  consent screen is left in "Testing" publishing status for more than 7
  days (keep it in "Production" status to avoid that). Minted once, outside
  the app, via `scripts/get-google-calendar-refresh-token.ts` — a local
  server + browser consent flow, following RFC 8252's loopback-redirect
  pattern for native apps (Google's supported replacement for the
  deprecated out-of-band/copy-paste flow). `lib/googleCalendarAuth.ts`
  exchanges the refresh token for a short-lived access token via Google's
  token endpoint — no `googleapis`/`google-auth-library` dependency,
  matching this codebase's existing "raw fetch, no SDK" convention for
  talking to Subsplash (`lib/subsplash.ts`, `lib/subsplashToken.ts`).
- **Setup the app can't do for itself:** a human with Google Cloud Console
  access must create an OAuth client (Credentials → Create Credentials →
  OAuth client ID → "Desktop app" — a regular OAuth client, not a service
  account, so the blocked policy doesn't apply), enable the Calendar API,
  share the target calendar with whichever Google account will run the
  one-time consent script ("Make changes to events"), run
  `npm run calendar:get-refresh-token` once as that account, then set
  `GOOGLE_CALENDAR_ID` / `GOOGLE_CALENDAR_CLIENT_ID` /
  `GOOGLE_CALENDAR_CLIENT_SECRET` / `GOOGLE_CALENDAR_REFRESH_TOKEN` directly
  (never pasted through chat/an agent). Until then,
  `GOOGLE_CALENDAR_USE_MOCK=true` (default) fakes every Calendar API call
  against an in-memory store, mirroring `SUBSPLASH_USE_MOCK` — so the
  button, route, and `calendar_syncs` logging are all fully exercisable
  before real credentials exist.
- **`calendar_syncs`** table (mirrors `attendance_imports`): one row per
  sync attempt — `ranAt`, `eventsSeen`, `eventsCreated`, `eventsUpdated`,
  `eventsDeleted`, `error` — feeding the Events page's status line.
- **Also runs automatically once a day**, via a Vercel Cron Job
  (`vercel.json`'s `crons`, `GET /api/cron/calendar-sync`, schedule
  `0 8 * * *` — roughly 3-4am US Eastern depending on DST, chosen as a quiet
  hour). A cron invocation has no admin browser session, so this is a
  separate route from the admin button's `POST /api/events/sync-calendar` —
  authorized instead via `CRON_SECRET` (`lib/cronAuth.ts`), the shared
  secret Vercel automatically attaches as `Authorization: Bearer
  <CRON_SECRET>` on requests it makes to a configured cron path. Same
  timing-safe bearer-token-compare shape as `lib/attendanceImportAuth.ts`.
  Vercel Hobby plan caps cron jobs at once per day; more frequent scheduling
  would require Pro.

## Consequences

- One-way only: an edit made directly on the Google Calendar event is not
  reflected back into Subsplash, and gets silently overwritten by the next
  sync (since the sync always re-asserts Subsplash's current state onto the
  same deterministic event id). Acceptable — Subsplash is the source of
  truth for this data; the calendar is a read-only mirror for the public.
- No location on synced events (v1): Subsplash's `Event.location` is only an
  id reference requiring a separate Locations fetch this feature doesn't do
  yet. Title, time, and description are enough value to start with.
- Sync freshness is at most a day stale (the cron cadence) between manual
  button clicks — acceptable for a public calendar mirror; nothing here
  needs to reflect a Subsplash edit within minutes.
- Reading `visibility`/`description_text`/`repetition_rules` for *all*
  events (not just `check_in_enabled` ones) required a fetch path of its own
  in `lib/calendarSync.ts`, independent of `lib/events.ts`'s `listEvents`
  (which hard-filters to `check_in_enabled`) and without extending the
  shared `AppEvent` type — kept isolated since nothing else in the app needs
  these fields.

## Alternatives rejected

- **A service-account key.** The original design, and still the more
  standard mechanism for pure server-to-server access with no consent flow
  — but this org's GCP policy (`iam.disableServiceAccountKeyCreation`)
  blocks creating one outright, confirmed while actually trying to set this
  up. Rather than ask an org admin to weaken a real "Secure by Default"
  security control for one small feature, the OAuth refresh-token approach
  above was used instead — it needs no special GCP permissions to set up
  and doesn't touch that policy at all.
- **OAuth tied to a staff member's live browser session**, rather than a
  refresh token minted once and stored server-side. Would inherit
  ADR-0021's exact session-fragility problem (a token that stops working
  once its owning browser session ends) for an unrelated reason — a
  refresh token avoids this because it's decoupled from any session once
  minted, not because of anything about *how* it was obtained.
- **`Workload Identity Federation`** (Google's other recommended
  service-account-key alternative). Built for workloads already running on
  a platform with a supported federated identity provider (AWS, Azure,
  GitHub Actions, Kubernetes, …); this app runs on Vercel, which isn't a
  natively supported WIF provider, so wiring this up would need real extra
  infrastructure for no benefit over the refresh-token approach here.
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
