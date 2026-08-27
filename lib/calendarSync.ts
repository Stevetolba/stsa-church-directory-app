// Syncs public Subsplash events (one-off and repeating series) onto the
// STSA Church Public Google Calendar (ADR-0022). Triggered by an admin-only
// button on the Events page — not scheduled/automatic.
//
// Scoped to three Subsplash calendars — confirmed against the live org's
// /events/v2/calendars (this org has 4 calendars total): "Service Schedule"
// (Liturgy, Vespers, Confession, Sunday School, The Well, …), "Upcoming
// Events" (general parish events), and "Community Impact Events". The
// fourth, "Children & Youth Calendar", is deliberately left out — not
// requested. An event/series belonging to none of these is excluded even
// if otherwise public — and the existing prune-stale-events logic
// (SYNC_SOURCE_TAG, lib/googleCalendar.ts) means a previously-synced event
// that no longer belongs to any of them (e.g. moved to Children & Youth) is
// removed from Google Calendar the next time this runs, with no separate
// cleanup step needed.
//
// A repeating series syncs as ONE native Google Calendar recurring event,
// not one event per occurrence: Subsplash already exposes a series' schedule
// as raw RFC5545 lines (RepeatingEvent.repetition_rules — DTSTART/RRULE/
// EXDATE, see lib/recurrence.ts), which map almost directly onto Google's
// own `recurrence` field. This reads Subsplash directly (not through
// lib/events.ts's listEvents, which hard-filters to check_in_enabled only —
// not what "all public events" means here) and doesn't extend the shared
// AppEvent type, since visibility/description aren't needed by anything
// else in the app.

import { createHash } from "crypto";
import { getDb, isDbConfigured } from "./db";
import { calendarSyncs, type CalendarSyncRow } from "./db/schema";
import { subsplashFetch, subsplashFetchHref } from "./subsplash";
import { zonedWallTimeToUtc } from "./eventTime";
import {
  deleteCalendarEvent,
  ensureGoogleCalendarAuth,
  listSyncedCalendarEventIds,
  upsertCalendarEvent,
  type GoogleCalendarEventInput,
} from "./googleCalendar";

// subsplashFetch/subsplashFetchHref have no mock awareness of their own —
// each higher-level lib/subsplash.ts function (searchProfiles, etc.)
// branches on this itself before ever calling them. This module talks to
// Subsplash directly (bypassing lib/events.ts's listEvents — see module
// comment) rather than through one of those already-mock-aware functions,
// so it has to do the same branch itself; otherwise SUBSPLASH_USE_MOCK=true
// (the default everywhere else in the app) would still make this feature
// hit the real network.
const USE_MOCK_SUBSPLASH_DATA = process.env.SUBSPLASH_USE_MOCK !== "false";

const MAX_SUBSPLASH_PAGE_SIZE = 100;
const MAX_SUBSPLASH_PAGES = 200;

// The Subsplash calendar ids this sync pulls from — confirmed against the
// live org's /events/v2/calendars; see the module comment above.
const SYNCED_CALENDAR_IDS = new Set([
  "8f5f3a9c-6384-46bb-9565-1e05341faed7", // Service Schedule
  "4dfeda2e-d3e6-4c8b-9d20-e5730f4bec2a", // Upcoming Events
  "3ea2874c-94ca-402e-94c0-cb5e6f249bcb", // Community Impact Events
]);

// --- Raw Subsplash shapes (only the fields this feature needs — confirmed
// against the live org; see docs/adr/0022-google-calendar-sync.md) ---

interface RawCalendarRef {
  id: string;
}

interface RawCalendarEvent {
  id: string;
  title?: string;
  description_text?: string;
  start_at?: string;
  end_at?: string;
  timezone?: string;
  status?: string;
  visibility?: string;
  _embedded?: { "repeating-event"?: { id?: string }; calendars?: RawCalendarRef[] };
}

interface RawCalendarRepeatingEvent {
  id: string;
  title?: string;
  event_title?: string;
  event_description_text?: string;
  timezone?: string;
  event_duration?: number; // minutes
  repetition_rules?: string[];
  visibility?: string;
  // Confirmed against the live org: RepeatingEvent has no `status` field at
  // all (unlike a materialized Event) — published_at is the "is this
  // series actually live" signal instead.
  published_at?: string | null;
  _embedded?: { calendars?: RawCalendarRef[] };
}

interface HalCollection<T> {
  total?: number;
  _links?: { next?: { href: string } };
  _embedded: Record<string, T[]>;
}

export interface PublicOneOffEvent {
  id: string;
  title: string;
  description?: string;
  startAt: string; // ISO 8601
  endAt?: string; // ISO 8601
  timezone: string;
}

export interface PublicSeries {
  id: string;
  title: string;
  description?: string;
  timezone: string;
  eventDurationMinutes: number;
  repetitionRules: string[];
}

// --- Pure helpers (unit-tested in lib/calendarSync.test.ts) ---

export function isPublicOneOffRaw(raw: { status?: string; visibility?: string }): boolean {
  return raw.status === "published" && raw.visibility === "public";
}

// Whether a raw event/series' embedded calendars include at least one of
// SYNCED_CALENDAR_IDS — an event can belong to more than one Subsplash
// calendar, so this checks membership, not exclusivity.
export function belongsToSyncedCalendar(calendars: RawCalendarRef[] | undefined): boolean {
  return (calendars ?? []).some((c) => SYNCED_CALENDAR_IDS.has(c.id));
}

export function isPublicSeriesRaw(raw: { visibility?: string; published_at?: string | null }): boolean {
  return raw.visibility === "public" && !!raw.published_at;
}

// A stable Google Calendar event id derived from the Subsplash event/series
// id — hex digest chars (0-9a-f) already satisfy Google's allowed id
// charset (lowercase a-v0-9) with no re-encoding, so this doubles as the
// upsert key with no separate id-mapping table. Same deterministic-id
// pattern as stableGuestId in lib/attendanceImport.ts, for the same reason:
// re-syncing the same event must always resolve to the same Google event.
export function googleEventIdFor(subsplashId: string): string {
  return createHash("sha256").update(`subsplash-cal:${subsplashId}`).digest("hex").slice(0, 40);
}

const DTSTART_LINE = /^DTSTART(?:;TZID=[^:]+)?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/;

export interface DtStartParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// Parses the DTSTART line out of a series' repetition_rules — the "first
// occurrence" wall-clock time Google needs as the recurring event's own
// start/end (Google derives the recurrence's own instances from this, it
// isn't itself part of the `recurrence` array — see recurrenceLinesWithoutDtStart).
export function parseDtStart(repetitionRules: string[]): DtStartParts | null {
  for (const line of repetitionRules) {
    const m = DTSTART_LINE.exec(line);
    if (m) {
      return {
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
        hour: Number(m[4]),
        minute: Number(m[5]),
        second: Number(m[6]),
      };
    }
  }
  return null;
}

const RRULE_UNTIL = /(UNTIL=)(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// RFC5545 §3.3.10: when DTSTART carries a timezone (as every real series'
// does here), RRULE's UNTIL value MUST be specified as explicit UTC (a
// trailing "Z"). Confirmed against the live org: Subsplash's own
// repetition_rules export almost always omits it (a "floating local"
// UNTIL — e.g. "UNTIL=20250523T235959", no Z) — Google Calendar's RRULE
// validator strictly enforces the RFC and rejects the whole event with
// "Invalid recurrence rule" for every series whose export omits it, while
// the `rrule` npm library this app already uses for its own occurrence
// expansion (lib/recurrence.ts) tolerates the missing Z without complaint.
// Converts the local wall-clock UNTIL value to a true UTC instant via the
// same zonedWallTimeToUtc DTSTART already uses, rather than naively
// appending "Z" to the local digits — which would silently shift the
// cutoff by the timezone's UTC offset instead of just labeling it
// correctly. Already-UTC UNTIL values (or an RRULE with no UNTIL at all)
// pass through unchanged.
export function normalizeRruleUntil(rruleLine: string, timeZone: string): string {
  const m = RRULE_UNTIL.exec(rruleLine);
  if (!m || m[8] === "Z") return rruleLine;
  const [full, prefix, year, month, day, hour, minute, second] = m;
  const utc = zonedWallTimeToUtc(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    timeZone
  );
  const replacement =
    `${prefix}${utc.getUTCFullYear()}${pad2(utc.getUTCMonth() + 1)}${pad2(utc.getUTCDate())}` +
    `T${pad2(utc.getUTCHours())}${pad2(utc.getUTCMinutes())}${pad2(utc.getUTCSeconds())}Z`;
  return rruleLine.slice(0, m.index) + replacement + rruleLine.slice(m.index + full.length);
}

// Google's `recurrence` field wants RRULE/EXDATE/RDATE lines only — DTSTART
// is expressed via the event's own `start` instead (see parseDtStart above).
// The RRULE line's UNTIL (if any) is normalized to UTC — see
// normalizeRruleUntil. EXDATE lines are left as-is: RFC5545 only mandates
// UTC for UNTIL specifically, and our EXDATE lines already carry their own
// TZID parameter matching DTSTART's, which is what the spec actually
// requires there.
export function recurrenceLinesWithoutDtStart(repetitionRules: string[], timeZone: string): string[] {
  return repetitionRules
    .filter((line) => !line.startsWith("DTSTART"))
    .map((line) => (line.startsWith("RRULE") ? normalizeRruleUntil(line, timeZone) : line));
}

// Previously-synced Google event ids that aren't in the current public set
// — the pruning input. Pulled out as its own pure function so the diff
// logic is unit-testable without a live Calendar call.
export function staleEventIds(currentIds: ReadonlySet<string>, previouslySyncedIds: ReadonlySet<string>): string[] {
  return Array.from(previouslySyncedIds).filter((id) => !currentIds.has(id));
}

export function oneOffToGoogleInput(e: PublicOneOffEvent): GoogleCalendarEventInput {
  const end = e.endAt ?? new Date(new Date(e.startAt).getTime() + 60 * 60 * 1000).toISOString();
  return {
    googleEventId: googleEventIdFor(e.id),
    subsplashId: e.id,
    summary: e.title,
    description: e.description,
    start: { dateTime: e.startAt, timeZone: e.timezone },
    end: { dateTime: end, timeZone: e.timezone },
  };
}

// Returns null when a series has no parseable DTSTART — shouldn't happen in
// practice (every real series has one), but a malformed one shouldn't crash
// the whole sync; the caller filters these out and the run still succeeds
// for everything else.
export function seriesToGoogleInput(s: PublicSeries): GoogleCalendarEventInput | null {
  const dtStart = parseDtStart(s.repetitionRules);
  if (!dtStart) return null;
  const startUtc = zonedWallTimeToUtc(
    dtStart.year,
    dtStart.month,
    dtStart.day,
    dtStart.hour,
    dtStart.minute,
    dtStart.second,
    s.timezone
  );
  const endUtc = new Date(startUtc.getTime() + s.eventDurationMinutes * 60 * 1000);
  return {
    googleEventId: googleEventIdFor(s.id),
    subsplashId: s.id,
    summary: s.title,
    description: s.description,
    start: { dateTime: startUtc.toISOString(), timeZone: s.timezone },
    end: { dateTime: endUtc.toISOString(), timeZone: s.timezone },
    recurrence: recurrenceLinesWithoutDtStart(s.repetitionRules, s.timezone),
  };
}

// --- Mock fixtures (SUBSPLASH_USE_MOCK=true, the default) — small and
// self-contained since no other feature needs "public event with a
// description/visibility/calendar" fixtures; lib/mockData.ts's AppEvent-
// shaped fixtures don't carry those fields at all. Modeled as already
// belonging to the Service Schedule calendar (no calendar filtering
// modeled here — these represent what should end up synced either way). ---

const MOCK_PUBLIC_ONE_OFF_EVENTS: PublicOneOffEvent[] = [
  {
    id: "mock-public-event-picnic",
    title: "Parish Picnic",
    description: "Annual summer picnic — all welcome.",
    startAt: "2026-09-06T16:00:00.000Z",
    endAt: "2026-09-06T19:00:00.000Z",
    timezone: "America/New_York",
  },
];

const MOCK_PUBLIC_SERIES: PublicSeries[] = [
  {
    id: "mock-public-series-liturgy",
    title: "LITURGY",
    description: "Sunday Divine Liturgy",
    timezone: "America/New_York",
    eventDurationMinutes: 150,
    repetitionRules: ["DTSTART;TZID=America/New_York:20260104T093000", "RRULE:FREQ=WEEKLY;BYDAY=SU"],
  },
];

// --- Subsplash fetch (own raw walk — see module comment for why this
// doesn't go through lib/events.ts's listEvents) ---

async function fetchAllPublicOneOffEvents(): Promise<PublicOneOffEvent[]> {
  if (USE_MOCK_SUBSPLASH_DATA) return MOCK_PUBLIC_ONE_OFF_EVENTS;

  const results: PublicOneOffEvent[] = [];
  let data = await subsplashFetch<HalCollection<RawCalendarEvent>>(
    `/events/v2/events?page[size]=${MAX_SUBSPLASH_PAGE_SIZE}&include=repeating-event,calendars`,
    { scopeToOrg: false }
  );
  for (let page = 1; page <= MAX_SUBSPLASH_PAGES; page++) {
    const raw = data._embedded?.events ?? [];
    for (const e of raw) {
      // Skip occurrences of a repeating series — that series syncs as one
      // recurring Google event instead (fetchAllPublicSeries below), so
      // including its individual occurrences here too would duplicate it.
      if (e._embedded?.["repeating-event"]?.id) continue;
      if (!isPublicOneOffRaw(e) || !e.start_at) continue;
      if (!belongsToSyncedCalendar(e._embedded?.calendars)) continue;
      results.push({
        id: e.id,
        title: e.title ?? "Untitled event",
        description: e.description_text,
        startAt: e.start_at,
        endAt: e.end_at,
        timezone: e.timezone ?? "America/New_York",
      });
    }
    const nextHref = data._links?.next?.href;
    if (!nextHref || raw.length === 0) break;
    data = await subsplashFetchHref<HalCollection<RawCalendarEvent>>(nextHref);
  }
  return results;
}

async function fetchAllPublicSeries(): Promise<PublicSeries[]> {
  if (USE_MOCK_SUBSPLASH_DATA) return MOCK_PUBLIC_SERIES;

  const results: PublicSeries[] = [];
  let data = await subsplashFetch<HalCollection<RawCalendarRepeatingEvent>>(
    `/events/v2/repeating-events?page[size]=${MAX_SUBSPLASH_PAGE_SIZE}&include=calendars`,
    { scopeToOrg: false }
  );
  for (let page = 1; page <= MAX_SUBSPLASH_PAGES; page++) {
    const raw = data._embedded?.["repeating-events"] ?? [];
    for (const s of raw) {
      if (!isPublicSeriesRaw(s)) continue;
      if (!belongsToSyncedCalendar(s._embedded?.calendars)) continue;
      const repetitionRules = s.repetition_rules ?? [];
      if (repetitionRules.length === 0) continue;
      results.push({
        id: s.id,
        title: s.event_title ?? s.title ?? "Untitled event",
        description: s.event_description_text,
        timezone: s.timezone ?? "America/New_York",
        eventDurationMinutes: s.event_duration ?? 60,
        repetitionRules,
      });
    }
    const nextHref = data._links?.next?.href;
    if (!nextHref || raw.length === 0) break;
    data = await subsplashFetchHref<HalCollection<RawCalendarRepeatingEvent>>(nextHref);
  }
  return results;
}

// --- Sync run persistence (calendar_syncs table) — mirrors
// lib/attendanceImport.ts's recordImportRun/lastImportRunForSeries pattern. ---

export interface CalendarSyncRun {
  ranAt: string; // ISO 8601
  eventsSeen: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  error: string | null;
}

function fromSyncRow(row: CalendarSyncRow): CalendarSyncRun {
  return {
    ranAt: row.ranAt.toISOString(),
    eventsSeen: row.eventsSeen,
    eventsCreated: row.eventsCreated,
    eventsUpdated: row.eventsUpdated,
    eventsDeleted: row.eventsDeleted,
    error: row.error,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __mockCalendarSyncs: CalendarSyncRun[] | undefined;
}
function mockSyncStore(): CalendarSyncRun[] {
  return (globalThis.__mockCalendarSyncs ??= []);
}

async function recordSyncRun(input: Omit<CalendarSyncRun, "ranAt">): Promise<CalendarSyncRun> {
  if (isDbConfigured()) {
    const db = getDb();
    const [row] = await db.insert(calendarSyncs).values(input).returning();
    return fromSyncRow(row);
  }
  const run: CalendarSyncRun = { ranAt: new Date().toISOString(), ...input };
  mockSyncStore().push(run);
  return run;
}

// Last sync run, most recent first — used by GET /api/events/sync-calendar
// for the Events page's status banner.
export async function lastCalendarSync(): Promise<CalendarSyncRun | null> {
  if (isDbConfigured()) {
    const db = getDb();
    const rows = await db.select().from(calendarSyncs);
    if (rows.length === 0) return null;
    rows.sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime());
    return fromSyncRow(rows[0]);
  }
  const runs = mockSyncStore();
  if (runs.length === 0) return null;
  return runs.slice().sort((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
}

// Joins per-event failure messages into calendar_syncs.error (one text
// column) without letting a pathological run (many bad events) blow it up
// — same "show the first several, then a count" idea as truncating a long
// unmatched-names list.
function summarizeFailures(failures: string[]): string | null {
  if (failures.length === 0) return null;
  const MAX_SHOWN = 5;
  const shown = failures.slice(0, MAX_SHOWN).join("; ");
  const remaining = failures.length - MAX_SHOWN;
  return remaining > 0 ? `${shown}; and ${remaining} more` : shown;
}

// The sync itself: fetch every public one-off event and public series from
// Subsplash, upsert each onto the calendar (idempotent — see
// googleEventIdFor), then prune anything previously synced that's no longer
// in the current public set. Never throws — a failure is recorded as a
// run with `error` set, same as lib/attendanceImport.ts's importOccurrence,
// so the button can always show *something* happened rather than a raw 500.
//
// One bad event doesn't sink the whole run — each upsert/delete is
// try/caught individually and its failure collected, same "one bad
// occurrence doesn't stop the rest" philosophy as
// scripts/sync-subsplash-attendance.ts's postAndReportAll. Confirmed this
// matters in practice: a single malformed event previously aborted the
// entire sync, reporting 0 created/updated even though hundreds of others
// would have succeeded.
export async function syncPublicEventsToCalendar(): Promise<CalendarSyncRun> {
  try {
    // Fail fast on broken/expired credentials — see the comment on
    // ensureGoogleCalendarAuth for why this can't just be left to the
    // per-event try/catch below.
    await ensureGoogleCalendarAuth();
    const [oneOff, series] = await Promise.all([fetchAllPublicOneOffEvents(), fetchAllPublicSeries()]);
    const inputs: GoogleCalendarEventInput[] = [
      ...oneOff.map(oneOffToGoogleInput),
      ...series.map(seriesToGoogleInput).filter((x): x is GoogleCalendarEventInput => x !== null),
    ];
    // The full desired set, regardless of whether each upsert below actually
    // succeeds — pruning must never delete an event just because it hit a
    // transient error this run; only because it's genuinely no longer part
    // of what should exist.
    const desiredIds = new Set(inputs.map((i) => i.googleEventId));

    const failures: string[] = [];
    let created = 0;
    let updated = 0;
    for (const input of inputs) {
      try {
        const result = await upsertCalendarEvent(input);
        if (result === "created") created++;
        else updated++;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }

    let deletedCount = 0;
    try {
      const previouslySynced = await listSyncedCalendarEventIds();
      const stale = staleEventIds(desiredIds, previouslySynced);
      for (const id of stale) {
        try {
          await deleteCalendarEvent(id);
          deletedCount++;
        } catch (err) {
          failures.push(err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }

    return await recordSyncRun({
      eventsSeen: inputs.length,
      eventsCreated: created,
      eventsUpdated: updated,
      eventsDeleted: deletedCount,
      error: summarizeFailures(failures),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return await recordSyncRun({ eventsSeen: 0, eventsCreated: 0, eventsUpdated: 0, eventsDeleted: 0, error: message });
  }
}
