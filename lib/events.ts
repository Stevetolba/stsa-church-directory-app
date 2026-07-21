// Events client (ADR-0015). Events are read from Subsplash (/events/v2/events)
// and — like profiles (ADR-0004/0009) — filtered/sorted in memory, since
// ListEventsV2 documents no query params in the vendored spec (though page[]/
// include= do work in practice — see the scopeToOrg note below). Attendance
// itself is app-owned (lib/attendance.ts). SUBSPLASH_USE_MOCK (default true)
// serves lib/mockData.ts fixtures instead.

import { unstable_cache } from "next/cache";
import type {
  AppEvent,
  EventSession,
  EventSource,
  EventStatus,
  SessionSuggestionType,
  SessionType,
} from "@/types/event";
import { subsplashFetch, subsplashFetchHref } from "./subsplash";
import { mockEvents } from "./mockData";
import { occurrenceDateInTz } from "./eventTime";
import { listOccurrenceDatesForSeries } from "./attendance";
import { expandRepeatingEvent, type RepeatingEventSeriesMeta } from "./recurrence";

const USE_MOCK_DATA = process.env.SUBSPLASH_USE_MOCK !== "false";
const MAX_SUBSPLASH_PAGE_SIZE = 100;
// Safety cap on how many pages we'll follow via _links.next (HAL pagination —
// ListEventsV2's own page[]/next scheme, distinct from the org's profile
// count).
const MAX_SUBSPLASH_PAGES = 200;
const CACHE_REVALIDATE_SECONDS = 300;
// How far to synthesize repeating-series occurrences around "now" (see
// getCachedEventsWithRepeating below) — generous enough for a year-long
// series frequency report plus a few months of forward agenda, without
// generating an effectively unbounded number of rows for series whose
// repeating_ends_at is a placeholder centuries out.
const SYNTHETIC_OCCURRENCE_PAST_DAYS = 400;
const SYNTHETIC_OCCURRENCE_FUTURE_DAYS = 180;

// --- Raw Subsplash event shape (only the fields we consume) ---

interface RawSession {
  id?: string;
  // Confirmed against the live API: the real field is `title` (the vendored
  // Session schema is a stub and doesn't document this). `name` is kept as a
  // fallback in case a different Subsplash surface uses it.
  title?: string;
  name?: string;
  // Confirmed against the live org: exactly "child" | "adult" | "everyone".
  type?: string;
  // suggestion_type gates which of these are meaningful — min_grade has been
  // observed populated even when suggestion_type is "age" or "none", so it
  // can't be trusted on its own (see types/event.ts).
  suggestion_type?: string;
  min_grade?: number;
  max_grade?: number;
  min_age?: number;
  max_age?: number;
}

interface RawEvent {
  id: string;
  title?: string;
  start_at?: string;
  end_at?: string;
  timezone?: string;
  all_day?: boolean;
  source?: string;
  status?: string;
  check_in_enabled?: boolean;
  _embedded?: {
    // check_in_enabled here is the series' own flag (confirmed against the
    // live API), distinct from — and not always mirrored onto — the
    // per-occurrence flag above. A materialized occurrence can default to
    // false while check-in is really configured on the repeating series, so
    // mapEvent treats either as enabling check-in.
    "repeating-event"?: { id?: string; check_in_enabled?: boolean };
    sessions?: RawSession[];
  };
}

interface HalCollection<T> {
  count: number;
  total: number;
  _links?: { next?: { href: string } };
  _embedded: Record<string, T[]>;
}

function mapSessionType(type: string | undefined): SessionType {
  return type === "child" || type === "adult" ? type : "everyone";
}

function mapSuggestionType(type: string | undefined): SessionSuggestionType | undefined {
  return type === "grade" || type === "age" || type === "none" ? type : undefined;
}

function mapSession(raw: RawSession, i: number): EventSession {
  return {
    id: raw.id ?? `session-${i}`,
    name: raw.title ?? raw.name ?? "Session",
    type: mapSessionType(raw.type),
    suggestionType: mapSuggestionType(raw.suggestion_type),
    minGrade: raw.min_grade,
    maxGrade: raw.max_grade,
    minAgeMonths: raw.min_age,
    maxAgeMonths: raw.max_age,
  };
}

function mapEvent(raw: RawEvent): AppEvent {
  const timezone = raw.timezone ?? "America/New_York";
  const start_at = raw.start_at ?? new Date().toISOString();
  const seriesId = raw._embedded?.["repeating-event"]?.id ?? raw.id;
  return {
    id: raw.id,
    series_id: seriesId,
    title: raw.title ?? "Untitled event",
    start_at,
    end_at: raw.end_at,
    timezone,
    all_day: raw.all_day ?? false,
    occurrence_date: occurrenceDateInTz(start_at, timezone),
    source: (raw.source as EventSource) ?? "standard",
    status: (raw.status as EventStatus) ?? "published",
    check_in_enabled: !!(raw.check_in_enabled || raw._embedded?.["repeating-event"]?.check_in_enabled),
    sessions: (raw._embedded?.sessions ?? []).map(mapSession),
  };
}

// Walk every page of /events/v2/events and cache the mapped result (ADR-0009
// pattern). Cached across requests so we don't re-walk on every page view.
//
// ListEventsV2 declares zero query parameters in the vendored spec (unlike
// ListProfiles, which explicitly lists Page/Fields/filters), but page[]/
// include= *are* accepted in practice — confirmed against the live API.
// filter[org_key] is the one that 400s ("filter not allowed: org_key"): events
// endpoints are scoped implicitly by the client_credentials token, unlike
// People/Households which require it explicitly. Hence scopeToOrg: false here
// while every other subsplashFetch caller keeps the default.
const getCachedEvents = unstable_cache(
  async (): Promise<AppEvent[]> => {
    const events: AppEvent[] = [];
    let data = await subsplashFetch<HalCollection<RawEvent>>(
      `/events/v2/events?page[size]=${MAX_SUBSPLASH_PAGE_SIZE}&include=sessions,repeating-event`,
      { scopeToOrg: false }
    );
    for (let page = 1; page <= MAX_SUBSPLASH_PAGES; page++) {
      const raw = data._embedded?.events ?? [];
      events.push(...raw.map(mapEvent));
      const nextHref = data._links?.next?.href;
      if (!nextHref || raw.length === 0) break;
      data = await subsplashFetchHref<HalCollection<RawEvent>>(nextHref);
    }
    return events;
  },
  ["subsplash-events-walk"],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ["subsplash-events"] }
);

// --- Repeating-series occurrence synthesis ---
//
// Subsplash stops materializing/exposing a repeating series' individual
// occurrence Events via /events/v2/events once the series' visibility is
// "dashboard" (Unlisted) — confirmed against the live org: a series with
// check_in_enabled: true and years of future weekly occurrences had ZERO of
// them appear in a complete /events/v2/events walk, while its sibling public
// series showed up normally. The series definition itself — including its
// own check_in_enabled, timezone, and repetition_rules — stays visible via
// the separate /events/v2/repeating-events endpoint regardless. So
// occurrences for any check-in-enabled series are computed here from its
// RRULE (lib/recurrence.ts) and merged with whatever real occurrence Events
// are available; a real occurrence wins over a synthesized one for the same
// (series_id, occurrence_date) since it carries the true Subsplash event id
// and any per-instance edits.

interface RawRepeatingEvent {
  id: string;
  title?: string;
  event_title?: string;
  timezone?: string;
  start_at?: string;
  event_duration?: number; // minutes
  repetition_rules?: string[];
  check_in_enabled?: boolean;
  _embedded?: {
    sessions?: RawSession[];
  };
}

interface RepeatingEventWithSessions extends RepeatingEventSeriesMeta {
  title: string;
  checkInEnabled: boolean;
  sessions: EventSession[];
}

function mapRepeatingEvent(raw: RawRepeatingEvent): RepeatingEventWithSessions {
  return {
    id: raw.id,
    title: raw.event_title ?? raw.title ?? "Untitled event",
    timezone: raw.timezone ?? "America/New_York",
    eventDurationMinutes: raw.event_duration ?? 60,
    repetitionRules: raw.repetition_rules ?? [],
    checkInEnabled: !!raw.check_in_enabled,
    sessions: (raw._embedded?.sessions ?? []).map(mapSession),
  };
}

// Walk every page of /events/v2/repeating-events (same HAL-next pagination
// and org-scoping caveats as getCachedEvents above).
const getCachedRepeatingEvents = unstable_cache(
  async (): Promise<RepeatingEventWithSessions[]> => {
    const series: RepeatingEventWithSessions[] = [];
    let data = await subsplashFetch<HalCollection<RawRepeatingEvent>>(
      `/events/v2/repeating-events?page[size]=${MAX_SUBSPLASH_PAGE_SIZE}&include=sessions`,
      { scopeToOrg: false }
    );
    for (let page = 1; page <= MAX_SUBSPLASH_PAGES; page++) {
      const raw = data._embedded?.["repeating-events"] ?? [];
      series.push(...raw.map(mapRepeatingEvent));
      const nextHref = data._links?.next?.href;
      if (!nextHref || raw.length === 0) break;
      data = await subsplashFetchHref<HalCollection<RawRepeatingEvent>>(nextHref);
    }
    return series;
  },
  ["subsplash-repeating-events-walk"],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ["subsplash-repeating-events"] }
);

// A synthesized occurrence has no corresponding Subsplash event resource, so
// it can't be looked up via GET /events/v2/events/{id} — getEvent() below
// checks for this prefix and resolves it from the merged list instead.
//
// Uses "_" as the separator, not ":" — confirmed against the live app that a
// colon in a page route's dynamic [id] segment arrives at the Server
// Component still percent-encoded ("%3A"), unlike a Route Handler's params
// (which decode it fine), so params.id never matched the stored id and every
// synthesized-occurrence check-in page 404'd. Neither a UUID nor a
// YYYY-MM-DD date can contain "_", so it's an unambiguous, encoding-free
// separator — avoids the whole bug class rather than patching around it.
const SYNTHETIC_ID_PREFIX = "repeating_";

function synthesizeOccurrence(series: RepeatingEventWithSessions, occurrence: { start_at: string; end_at: string }): AppEvent {
  return {
    id: `${SYNTHETIC_ID_PREFIX}${series.id}_${occurrenceDateInTz(occurrence.start_at, series.timezone)}`,
    series_id: series.id,
    title: series.title,
    start_at: occurrence.start_at,
    end_at: occurrence.end_at,
    timezone: series.timezone,
    all_day: false,
    occurrence_date: occurrenceDateInTz(occurrence.start_at, series.timezone),
    source: "repeating",
    status: "published",
    check_in_enabled: true, // only synthesized for series where this is already true
    sessions: series.sessions,
  };
}

// Real materialized events merged with synthesized occurrences of every
// check-in-enabled repeating series, real data winning on any date both
// exist for. Real-mode only — mock fixtures already hand-author the full
// occurrence list they need (lib/mockData.ts).
const getCachedEventsWithRepeating = unstable_cache(
  async (): Promise<AppEvent[]> => {
    // Promise.allSettled, not Promise.all: a transient failure walking
    // /events/v2/repeating-events (Subsplash rate limits both this and the
    // /events/v2/events walk under load — confirmed happening in practice)
    // must not take down the whole event list. Real materialized events
    // still show even if synthesis of Unlisted-series occurrences fails for
    // this cache period; it just retries next revalidation.
    const [materializedResult, seriesResult] = await Promise.allSettled([
      getCachedEvents(),
      getCachedRepeatingEvents(),
    ]);
    if (materializedResult.status === "rejected") {
      console.error("Failed to fetch materialized events:", materializedResult.reason);
    }
    if (seriesResult.status === "rejected") {
      console.error("Failed to fetch repeating-event series:", seriesResult.reason);
    }
    const materialized = materializedResult.status === "fulfilled" ? materializedResult.value : [];
    const allSeries = seriesResult.status === "fulfilled" ? seriesResult.value : [];
    const byKey = new Map(materialized.map((e) => [`${e.series_id}::${e.occurrence_date}`, e]));

    const now = new Date();
    const from = new Date(now.getTime() - SYNTHETIC_OCCURRENCE_PAST_DAYS * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + SYNTHETIC_OCCURRENCE_FUTURE_DAYS * 24 * 60 * 60 * 1000);

    for (const series of allSeries) {
      if (!series.checkInEnabled) continue;
      for (const occurrence of expandRepeatingEvent(series, from, to)) {
        const key = `${series.id}::${occurrenceDateInTz(occurrence.start_at, series.timezone)}`;
        if (!byKey.has(key)) byKey.set(key, synthesizeOccurrence(series, occurrence));
      }
    }
    return Array.from(byKey.values());
  },
  ["subsplash-events-with-repeating"],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ["subsplash-events", "subsplash-repeating-events"] }
);

async function allEvents(): Promise<AppEvent[]> {
  return USE_MOCK_DATA ? mockEvents : getCachedEventsWithRepeating();
}

export interface ListEventsParams {
  // ISO date bounds (inclusive) on occurrence_date, e.g. "2026-07-01".
  from?: string;
  to?: string;
  search?: string;
  // Include unpublished (draft) events. Defaults to false — check-in surfaces
  // only real, published events.
  includeDrafts?: boolean;
}

// All events matching the filters, sorted by start_at ascending. Filtering is
// in memory (ADR-0004) since ListEventsV2 exposes no query params. This whole
// module backs only the check-in surfaces (app/api/events), so events without
// check-in toggled on in Subsplash are excluded — there's nothing to do with
// them here.
export async function listEvents(params: ListEventsParams = {}): Promise<AppEvent[]> {
  const { from, to, search, includeDrafts = false } = params;
  const needle = search?.trim().toLowerCase();
  const all = await allEvents();
  return all
    .filter((e) => {
      if (!e.check_in_enabled) return false;
      if (!includeDrafts && e.status === "draft") return false;
      if (from && e.occurrence_date < from) return false;
      if (to && e.occurrence_date > to) return false;
      if (needle && !e.title.toLowerCase().includes(needle)) return false;
      return true;
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

// Events whose occurrence_date is today in their own timezone — the door-view
// list. Uses each event's timezone so a multi-campus church with one zone is
// simple and a future cross-zone setup still lands events on the right day.
export async function listTodaysEvents(now: Date = new Date()): Promise<AppEvent[]> {
  const all = await allEvents();
  return all
    .filter(
      (e) =>
        e.check_in_enabled &&
        e.status !== "draft" &&
        e.occurrence_date === occurrenceDateInTz(now.toISOString(), e.timezone)
    )
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export async function getEvent(id: string): Promise<AppEvent | null> {
  // Synthesized occurrences (id like "repeating_<seriesId>_<date>") have no
  // backing Subsplash event resource to GET directly — resolve them from the
  // same merged (real + synthesized) list the check-in surfaces already use.
  if (id.startsWith(SYNTHETIC_ID_PREFIX)) {
    try {
      const all = await allEvents();
      return all.find((e) => e.id === id) ?? null;
    } catch (e) {
      console.error("Failed to resolve synthesized event id", id, e);
      return null;
    }
  }
  if (USE_MOCK_DATA) {
    return mockEvents.find((e) => e.id === id) ?? null;
  }
  try {
    const raw = await subsplashFetch<RawEvent>(
      `/events/v2/events/${id}?include=sessions,repeating-event`,
      { scopeToOrg: false }
    );
    return mapEvent(raw);
  } catch {
    return null;
  }
}

export interface SeriesOccurrence {
  occurrence_date: string;
  eventId: string; // representative event id for this occurrence
  hasEvent: boolean; // false if only known from a backfilled check-in
}

// Past+present occurrences of a series, newest first. Unions the events known
// from Subsplash with occurrence_dates that only exist because attendance was
// backfilled for them, so a report never drops a date someone was checked into.
export async function listOccurrences(
  seriesId: string,
  opts: { from?: string; to?: string; limit?: number } = {}
): Promise<SeriesOccurrence[]> {
  const all = await allEvents();
  const byDate = new Map<string, SeriesOccurrence>();
  for (const e of all) {
    if (e.series_id !== seriesId) continue;
    byDate.set(e.occurrence_date, { occurrence_date: e.occurrence_date, eventId: e.id, hasEvent: true });
  }
  for (const date of await listOccurrenceDatesForSeries(seriesId)) {
    if (!byDate.has(date)) {
      byDate.set(date, { occurrence_date: date, eventId: seriesId, hasEvent: false });
    }
  }
  let occurrences = Array.from(byDate.values());
  if (opts.from) occurrences = occurrences.filter((o) => o.occurrence_date >= opts.from!);
  if (opts.to) occurrences = occurrences.filter((o) => o.occurrence_date <= opts.to!);
  occurrences.sort((a, b) => b.occurrence_date.localeCompare(a.occurrence_date));
  return opts.limit ? occurrences.slice(0, opts.limit) : occurrences;
}

// Guesses a series' campus from its title — a light heuristic, not a
// structured field (Subsplash's Event has no campus of its own, only
// Profile does). Shared by the /reports landing page (grouping) and the
// per-series report's Absentees tab (scoping the roster to the matching
// Profile.campus so a single-campus series doesn't pull in the other
// campus's households). Confirmed against the live org's real title
// conventions rather than assuming one delimiter: "Sunday School
// [Arlington]", "Men's Ministry Meeting - Leesburg", "Leesburg AFC 203" all
// just contain the campus name somewhere, with no consistent
// prefix/suffix/bracket pattern — so this matches on presence, not position.
export function campusGroupFor(title: string): string {
  if (/arlington/i.test(title)) return "Arlington";
  if (/leesburg/i.test(title)) return "Leesburg";
  return "General";
}

export interface SeriesSummary {
  seriesId: string;
  title: string;
  sessions: EventSession[];
  // An occurrence to enter the report page through (the nearest one at or
  // before today, falling back to the nearest future one for a series with
  // no past occurrences yet) — /reports links each series card straight to
  // its report rather than making the user pick an event first.
  representativeEventId: string;
}

// Every distinct check-in-enabled *repeating* series, one representative
// event each — the /reports landing page's list. One-off events are
// deliberately excluded: "monthly/yearly attendance" only means something
// for something that recurs (Liturgy, Sunday School), and a real org can
// have hundreds of one-off check-in-enabled events (retreats, socials,
// one-time classes) that would otherwise swamp the list. A one-off event's
// series_id always equals its own id (mapEvent falls back to raw.id when
// there's no repeating-event embed); anything that actually belongs to a
// series has a distinct series_id — a more robust signal than trusting
// Subsplash's own "source" field to be "repeating" on every materialized
// occurrence. ADR-0015 Phase 4.
export async function listSeries(): Promise<SeriesSummary[]> {
  const events = (await listEvents()).filter((e) => e.series_id !== e.id);
  const today = occurrenceDateInTz(new Date().toISOString(), "UTC");
  const bySeriesId = new Map<string, AppEvent[]>();
  for (const e of events) {
    const group = bySeriesId.get(e.series_id) ?? [];
    group.push(e);
    bySeriesId.set(e.series_id, group);
  }
  const result: SeriesSummary[] = [];
  for (const [seriesId, group] of Array.from(bySeriesId.entries())) {
    // group is already ascending by start_at (listEvents' own sort).
    const past = group.filter((e) => e.occurrence_date <= today);
    const representative = past[past.length - 1] ?? group[0];
    result.push({
      seriesId,
      title: representative.title,
      sessions: representative.sessions,
      representativeEventId: representative.id,
    });
  }
  return result.sort((a, b) => a.title.localeCompare(b.title));
}
