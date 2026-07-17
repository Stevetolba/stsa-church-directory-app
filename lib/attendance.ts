// App-owned attendance store (ADR-0015). Two interchangeable implementations,
// selected by isDbConfigured(): Neon Postgres (via Drizzle) in production, or
// an in-memory globalThis array seeded from lib/mockData.ts for zero-setup dev
// — mirroring SUBSPLASH_USE_MOCK. People/events stay in Subsplash; rows here
// reference the Subsplash profile/event ids.

import { and, eq, inArray } from "drizzle-orm";
import { getDb, isDbConfigured } from "./db";
import { checkIns, type CheckInRow } from "./db/schema";
import { mockCheckIns } from "./mockData";
import type { AttendanceSummary, CheckInMethod, CheckInRecord } from "@/types/attendance";

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
