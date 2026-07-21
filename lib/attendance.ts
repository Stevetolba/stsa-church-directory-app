// App-owned attendance store (ADR-0015). Two interchangeable implementations,
// selected by isDbConfigured(): Neon Postgres (via Drizzle) in production, or
// an in-memory globalThis array seeded from lib/mockData.ts for zero-setup dev
// — mirroring SUBSPLASH_USE_MOCK. People/events stay in Subsplash; rows here
// reference the Subsplash profile/event ids.

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, isDbConfigured } from "./db";
import { checkIns, type CheckInRow } from "./db/schema";
import { mockCheckIns } from "./mockData";
import { searchChildren, searchProfiles } from "./subsplash";
import type { AttendanceSummary, CheckInMethod, CheckInRecord } from "@/types/attendance";
import type { Campus, Profile } from "@/types/profile";

// --- Row mapping (DB <-> app record) ---

function fromRow(row: CheckInRow): CheckInRecord {
  return {
    id: row.id,
    seriesId: row.seriesId,
    eventId: row.eventId,
    // Drizzle's `date` column returns a "YYYY-MM-DD" string already.
    occurrenceDate: row.occurrenceDate,
    profileId: row.profileId,
    displayName: row.displayName,
    isChild: row.isChild,
    sessionId: row.sessionId,
    sessionName: row.sessionName,
    checkedInAt: row.checkedInAt.toISOString(),
    checkedInBy: row.checkedInBy,
    droppedOffByProfileId: row.droppedOffByProfileId,
    droppedOffByName: row.droppedOffByName,
    matchCode: row.matchCode,
    checkedOutAt: row.checkedOutAt ? row.checkedOutAt.toISOString() : null,
    checkedOutBy: row.checkedOutBy,
    method: row.method as CheckInMethod,
    isGuest: row.isGuest,
  };
}

// --- Mock store helpers ---

function mockStore(): CheckInRecord[] {
  // Importing mockCheckIns above runs the one-time seed onto globalThis.
  void mockCheckIns;
  return (globalThis.__mockCheckIns ??= []);
}

// --- Public API ---

export interface RecordCheckInInput {
  seriesId: string;
  eventId: string;
  occurrenceDate: string; // YYYY-MM-DD
  profileId: string; // Subsplash id or "guest:<uuid>"
  displayName: string;
  isChild: boolean;
  sessionId?: string | null;
  sessionName?: string | null;
  checkedInBy: string;
  // The adult household member who dropped this child off (not who operated
  // the screen). Only meaningful for a child; ignored otherwise.
  droppedOffByProfileId?: string | null;
  droppedOffByName?: string | null;
  matchCode?: string | null;
  method?: CheckInMethod;
  isGuest?: boolean;
}

// Idempotent check-in. On a repeat (same person/occurrence) it updates the
// chosen session and clears any prior check-out (the person returned), rather
// than creating a duplicate — enforced by the (series, date, profile) unique
// constraint in the DB and mirrored in the mock.
export async function recordCheckIn(input: RecordCheckInInput): Promise<CheckInRecord> {
  const method = input.method ?? "live";
  const isGuest = input.isGuest ?? input.profileId.startsWith("guest:");

  if (isDbConfigured()) {
    const db = getDb();
    const [row] = await db
      .insert(checkIns)
      .values({
        seriesId: input.seriesId,
        eventId: input.eventId,
        occurrenceDate: input.occurrenceDate,
        profileId: input.profileId,
        displayName: input.displayName,
        isChild: input.isChild,
        sessionId: input.sessionId ?? null,
        sessionName: input.sessionName ?? null,
        checkedInBy: input.checkedInBy,
        droppedOffByProfileId: input.droppedOffByProfileId ?? null,
        droppedOffByName: input.droppedOffByName ?? null,
        matchCode: input.matchCode ?? null,
        method,
        isGuest,
      })
      .onConflictDoUpdate({
        target: [checkIns.seriesId, checkIns.occurrenceDate, checkIns.profileId],
        set: {
          sessionId: input.sessionId ?? null,
          sessionName: input.sessionName ?? null,
          droppedOffByProfileId: input.droppedOffByProfileId ?? null,
          droppedOffByName: input.droppedOffByName ?? null,
          matchCode: input.matchCode ?? null,
          checkedOutAt: null,
          checkedOutBy: null,
        },
      })
      .returning();
    return fromRow(row);
  }

  const store = mockStore();
  const existing = store.find(
    (r) =>
      r.seriesId === input.seriesId &&
      r.occurrenceDate === input.occurrenceDate &&
      r.profileId === input.profileId
  );
  if (existing) {
    existing.sessionId = input.sessionId ?? null;
    existing.sessionName = input.sessionName ?? null;
    existing.droppedOffByProfileId = input.droppedOffByProfileId ?? null;
    existing.droppedOffByName = input.droppedOffByName ?? null;
    existing.matchCode = input.matchCode ?? null;
    existing.checkedOutAt = null;
    existing.checkedOutBy = null;
    return existing;
  }
  const record: CheckInRecord = {
    id: `checkin-${crypto.randomUUID()}`,
    seriesId: input.seriesId,
    eventId: input.eventId,
    occurrenceDate: input.occurrenceDate,
    profileId: input.profileId,
    displayName: input.displayName,
    isChild: input.isChild,
    sessionId: input.sessionId ?? null,
    sessionName: input.sessionName ?? null,
    checkedInAt: new Date().toISOString(),
    checkedInBy: input.checkedInBy,
    droppedOffByProfileId: input.droppedOffByProfileId ?? null,
    droppedOffByName: input.droppedOffByName ?? null,
    matchCode: input.matchCode ?? null,
    checkedOutAt: null,
    checkedOutBy: null,
    method,
    isGuest,
  };
  store.push(record);
  return record;
}

export interface CheckOutInput {
  seriesId: string;
  occurrenceDate: string;
  profileId: string;
  checkedOutBy: string;
}

export async function checkOut(input: CheckOutInput): Promise<CheckInRecord | null> {
  if (isDbConfigured()) {
    const db = getDb();
    const [row] = await db
      .update(checkIns)
      .set({ checkedOutAt: new Date(), checkedOutBy: input.checkedOutBy })
      .where(
        and(
          eq(checkIns.seriesId, input.seriesId),
          eq(checkIns.occurrenceDate, input.occurrenceDate),
          eq(checkIns.profileId, input.profileId)
        )
      )
      .returning();
    return row ? fromRow(row) : null;
  }

  const record = mockStore().find(
    (r) =>
      r.seriesId === input.seriesId &&
      r.occurrenceDate === input.occurrenceDate &&
      r.profileId === input.profileId
  );
  if (!record) return null;
  record.checkedOutAt = new Date().toISOString();
  record.checkedOutBy = input.checkedOutBy;
  return record;
}

export interface RemoveCheckInInput {
  seriesId: string;
  occurrenceDate: string;
  profileId: string;
}

// Undo — deletes a mis-tap entirely (distinct from check-out).
export async function removeCheckIn(input: RemoveCheckInInput): Promise<void> {
  if (isDbConfigured()) {
    const db = getDb();
    await db
      .delete(checkIns)
      .where(
        and(
          eq(checkIns.seriesId, input.seriesId),
          eq(checkIns.occurrenceDate, input.occurrenceDate),
          eq(checkIns.profileId, input.profileId)
        )
      );
    return;
  }
  const store = mockStore();
  const idx = store.findIndex(
    (r) =>
      r.seriesId === input.seriesId &&
      r.occurrenceDate === input.occurrenceDate &&
      r.profileId === input.profileId
  );
  if (idx !== -1) store.splice(idx, 1);
}

// The existing row for a person at this occurrence, if any — used by the
// check-in route to preserve drop-off/match-code data across a repeat
// submission that doesn't itself carry it (e.g. changing a session after the
// fact shouldn't blank out who dropped the child off or reissue their code).
export async function getCheckIn(
  seriesId: string,
  occurrenceDate: string,
  profileId: string
): Promise<CheckInRecord | null> {
  if (isDbConfigured()) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(checkIns)
      .where(
        and(
          eq(checkIns.seriesId, seriesId),
          eq(checkIns.occurrenceDate, occurrenceDate),
          eq(checkIns.profileId, profileId)
        )
      );
    return row ? fromRow(row) : null;
  }
  return (
    mockStore().find(
      (r) => r.seriesId === seriesId && r.occurrenceDate === occurrenceDate && r.profileId === profileId
    ) ?? null
  );
}

// Pickup match codes currently in play for an occurrence (still-present
// check-ins only — a departed child's old code is fair game to reuse), so a
// freshly generated code doesn't collide with another family's.
export async function activeMatchCodes(seriesId: string, occurrenceDate: string): Promise<Set<string>> {
  const records = await listCheckIns(seriesId, occurrenceDate);
  return new Set(
    records.filter((r): r is CheckInRecord & { matchCode: string } => !r.checkedOutAt && !!r.matchCode).map(
      (r) => r.matchCode
    )
  );
}

export async function listCheckIns(
  seriesId: string,
  occurrenceDate: string
): Promise<CheckInRecord[]> {
  if (isDbConfigured()) {
    const db = getDb();
    const rows = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.seriesId, seriesId), eq(checkIns.occurrenceDate, occurrenceDate)));
    return rows.map(fromRow).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return mockStore()
    .filter((r) => r.seriesId === seriesId && r.occurrenceDate === occurrenceDate)
    .map((r) => ({ ...r }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Pure summary over a set of check-in records — unit-tested.
export function summarize(records: CheckInRecord[]): AttendanceSummary {
  const bySessionMap = new Map<string, { sessionId: string | null; sessionName: string; count: number }>();
  let present = 0;
  let children = 0;
  let guests = 0;
  for (const r of records) {
    if (!r.checkedOutAt) present++;
    if (r.isChild) children++;
    if (r.isGuest) guests++;
    const key = r.sessionId ?? "__none__";
    const name = r.sessionName ?? "General";
    const entry = bySessionMap.get(key) ?? { sessionId: r.sessionId ?? null, sessionName: name, count: 0 };
    entry.count++;
    bySessionMap.set(key, entry);
  }
  return {
    total: records.length,
    present,
    children,
    adults: records.length - children,
    guests,
    bySession: Array.from(bySessionMap.values()).sort((a, b) =>
      a.sessionName.localeCompare(b.sessionName)
    ),
  };
}

export async function attendanceSummary(
  seriesId: string,
  occurrenceDate: string
): Promise<AttendanceSummary> {
  return summarize(await listCheckIns(seriesId, occurrenceDate));
}

// Profile ids with at least one check-in across the given occurrence dates —
// feeds absentee computation.
export async function attendedProfileIds(
  seriesId: string,
  occurrenceDates: string[]
): Promise<Set<string>> {
  if (occurrenceDates.length === 0) return new Set();
  if (isDbConfigured()) {
    const db = getDb();
    const rows = await db
      .select({ profileId: checkIns.profileId })
      .from(checkIns)
      .where(
        and(eq(checkIns.seriesId, seriesId), inArray(checkIns.occurrenceDate, occurrenceDates))
      );
    return new Set(rows.map((r) => r.profileId));
  }
  const dates = new Set(occurrenceDates);
  return new Set(
    mockStore()
      .filter((r) => r.seriesId === seriesId && dates.has(r.occurrenceDate))
      .map((r) => r.profileId)
  );
}

// Distinct occurrence_dates that have any check-in for a series — used by
// listOccurrences() so backfilled dates without a Subsplash event still appear.
export async function listOccurrenceDatesForSeries(seriesId: string): Promise<string[]> {
  if (isDbConfigured()) {
    const db = getDb();
    const rows = await db
      .selectDistinct({ occurrenceDate: checkIns.occurrenceDate })
      .from(checkIns)
      .where(eq(checkIns.seriesId, seriesId));
    return rows.map((r) => r.occurrenceDate);
  }
  return Array.from(
    new Set(mockStore().filter((r) => r.seriesId === seriesId).map((r) => r.occurrenceDate))
  );
}

// --- Reports & absentees (ADR-0015 Phase 4) ---

// Every check-in row for a series within a date range — feeds the series
// frequency report. Unbounded by occurrence (unlike listCheckIns, which is
// one date at a time); a church's attendance volume over even a year is
// small enough to aggregate in memory (summarizeSeriesFrequency below)
// rather than pushing the GROUP BY into SQL.
export async function listCheckInsForSeries(
  seriesId: string,
  from: string,
  to: string
): Promise<CheckInRecord[]> {
  if (isDbConfigured()) {
    const db = getDb();
    const rows = await db
      .select()
      .from(checkIns)
      .where(
        and(eq(checkIns.seriesId, seriesId), gte(checkIns.occurrenceDate, from), lte(checkIns.occurrenceDate, to))
      );
    return rows.map(fromRow);
  }
  return mockStore()
    .filter((r) => r.seriesId === seriesId && r.occurrenceDate >= from && r.occurrenceDate <= to)
    .map((r) => ({ ...r }));
}

export interface SeriesFrequencyPerson {
  profileId: string;
  displayName: string;
  isChild: boolean;
  // Occurrence dates (within the period) this person has at least one
  // check-in for, ascending.
  attendedDates: string[];
  lastAttended: string | null;
}

export interface SeriesFrequencyResult {
  // Every occurrence_date in the period (ascending) — the report's column
  // headers / denominator, from lib/events.listOccurrences (Subsplash +
  // any backfill-only dates), not just dates that happen to have a check-in.
  occurrenceDates: string[];
  people: SeriesFrequencyPerson[];
}

// Pure aggregation — records already scoped to one series/date range (see
// listCheckInsForSeries) grouped by person. Only people with at least one
// check-in appear here (findAbsentees below covers the zero-attendance
// case, which a GROUP BY over check-ins can never surface). Sorted most-
// to-least frequent so a declining attender sorts toward the bottom.
export function summarizeSeriesFrequency(
  records: CheckInRecord[],
  occurrenceDates: string[]
): SeriesFrequencyResult {
  const inRange = new Set(occurrenceDates);
  const byPerson = new Map<string, SeriesFrequencyPerson>();
  for (const r of records) {
    if (!inRange.has(r.occurrenceDate)) continue;
    const entry = byPerson.get(r.profileId) ?? {
      profileId: r.profileId,
      displayName: r.displayName,
      isChild: r.isChild,
      attendedDates: [],
      lastAttended: null,
    };
    if (!entry.attendedDates.includes(r.occurrenceDate)) entry.attendedDates.push(r.occurrenceDate);
    entry.displayName = r.displayName;
    entry.isChild = r.isChild;
    byPerson.set(r.profileId, entry);
  }
  const people = Array.from(byPerson.values()).map((entry) => {
    const attendedDates = [...entry.attendedDates].sort();
    return { ...entry, attendedDates, lastAttended: attendedDates[attendedDates.length - 1] ?? null };
  });
  people.sort((a, b) => b.attendedDates.length - a.attendedDates.length || a.displayName.localeCompare(b.displayName));
  return { occurrenceDates: [...occurrenceDates].sort(), people };
}

// Pure set difference — the roster members with zero check-ins across the
// given occurrence dates. Split out from findAbsentees so the actual
// filtering logic is unit-testable without a live/mock profile fetch.
export function computeAbsentees<T extends { id: string }>(roster: T[], attended: Set<string>): T[] {
  return roster.filter((p) => !attended.has(p.id));
}

export interface FindAbsenteesParams {
  seriesId: string;
  // The window to check attendance across, e.g. a series' last N occurrences
  // (see /api/attendance/absentees). Someone with zero check-ins across
  // every one of these dates is an absentee — including someone who has
  // literally never attended, who would never show up in a GROUP BY over
  // check-ins (see summarizeSeriesFrequency's doc comment).
  occurrenceDates: string[];
  // Defaults to the child-bearing-household pool (same as /api/children,
  // ADR-0011) — the common case for a Sunday School series. Pass false for
  // an "everyone" series like Liturgy to check the full directory instead.
  childrenOnly?: boolean;
  search?: string;
  campus?: Campus[];
  gradeFrom?: number;
  gradeTo?: number;
}

// Roster fetch (Subsplash) minus attended (this series' check-ins) — the
// people who should have been at the last N occurrences and weren't.
export async function findAbsentees(params: FindAbsenteesParams): Promise<Profile[]> {
  const attended = await attendedProfileIds(params.seriesId, params.occurrenceDates);
  const rosterParams = {
    search: params.search,
    campus: params.campus,
    gradeFrom: params.gradeFrom,
    gradeTo: params.gradeTo,
    pageSize: 5000,
  };
  const result =
    params.childrenOnly === false ? await searchProfiles(rosterParams) : await searchChildren(rosterParams);
  return computeAbsentees(result.profiles, attended);
}
