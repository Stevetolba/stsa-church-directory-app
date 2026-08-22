// Pure resolution logic for the Subsplash attendance import (ADR-0021).
// Subsplash's Check-In dashboard export gives us names (and sometimes an
// email or its own profile id) per occurrence — this module turns that into
// the (series_id, occurrence_date, profile_id) keys lib/attendance.ts's
// check_ins table needs, without making any new Subsplash traffic: it reads
// from the same cached full-profile-walk (ADR-0009) and event list that the
// rest of the app already uses.

import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "./db";
import { attendanceImports, type AttendanceImportRow } from "./db/schema";
import { getEvent, listSeries } from "./events";
import { recordCheckIn } from "./attendance";
import { searchProfiles } from "./subsplash";
import type { Profile } from "@/types/profile";
import type {
  AttendanceImportAttendee,
  AttendanceImportOccurrence,
  AttendanceImportRequest,
} from "./validation/attendance";

export interface ResolvedOccurrence {
  seriesId: string;
  eventId: string;
}

export interface ResolveOccurrenceInput {
  subsplashEventId?: string;
  eventTitle?: string;
  occurrenceDate: string;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

// Finds which series/event a CSV occurrence belongs to. Prefers a real
// Subsplash event id (exact — no ambiguity); falls back to matching the
// exported event title against known series, which is all a plain
// attendance CSV usually carries. Returns null when neither resolves, so the
// caller can report the whole occurrence as failed rather than guessing.
export async function resolveOccurrence(input: ResolveOccurrenceInput): Promise<ResolvedOccurrence | null> {
  if (input.subsplashEventId) {
    const event = await getEvent(input.subsplashEventId);
    if (event) return { seriesId: event.series_id, eventId: event.id };
    // Fall through to title matching — an id that doesn't resolve (e.g. an
    // occurrence Subsplash re-materialized under a new id) shouldn't fail
    // the whole occurrence if we can still place it by title.
  }
  if (input.eventTitle) {
    const series = await listSeries();
    const target = normalizeTitle(input.eventTitle);
    const match = series.find((s) => normalizeTitle(s.title) === target);
    if (match) {
      // No specific Subsplash event id for this exact date is required —
      // eventId on a check-in row is a display-only snapshot never read
      // back by any report (only series_id + occurrence_date are queried).
      // A one-off event already degenerates this way (series_id === id).
      return { seriesId: match.seriesId, eventId: match.seriesId };
    }
  }
  return null;
}

export type AttendeeResolution =
  | { status: "matched"; profileId: string; isChild: boolean }
  | { status: "unmatched" };

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ProfileLookup {
  byId: Map<string, Profile>;
  byEmail: Map<string, Profile[]>;
  byName: Map<string, Profile[]>;
}

// Resolves one exported attendee to a directory profile. Match order:
// explicit Subsplash profile id (authoritative, when a source provides one)
// → a full name that's unique across the whole directory → if the name is
// ambiguous (two people sharing it), narrow to the one whose email also
// matches. Email is deliberately NOT used as a primary, name-independent
// match key: confirmed against a real Subsplash Check-In export, a child's
// "[Checked in] Email" column is frequently the *guardian's* email (Subsplash
// pre-fills it from the household's contact info), not the child's own — a
// name-independent email match would then silently attribute the child's
// attendance to the parent's profile instead. Using email only to break a
// tie between two people who already share the exported name avoids that:
// the parent's name won't match the child's, so the parent is never a
// candidate to begin with. Any other unresolved case (no name match at all,
// or a still-ambiguous name) is left unmatched rather than guessed — a wrong
// guess here silently marks the *actual* person absent while crediting
// someone else's attendance, which is worse than a visible unmatched row.
export function resolveAttendee(attendee: AttendanceImportAttendee, lookup: ProfileLookup): AttendeeResolution {
  if (attendee.subsplashProfileId) {
    const p = lookup.byId.get(attendee.subsplashProfileId);
    if (p) return { status: "matched", profileId: p.id, isChild: p.household_role === "child" };
  }

  const nameMatches = lookup.byName.get(normalizeName(attendee.name)) ?? [];
  if (nameMatches.length === 1) {
    return { status: "matched", profileId: nameMatches[0].id, isChild: nameMatches[0].household_role === "child" };
  }
  if (nameMatches.length > 1 && attendee.email) {
    const email = attendee.email.trim().toLowerCase();
    const narrowed = nameMatches.filter((p) => p.email.trim().toLowerCase() === email);
    if (narrowed.length === 1) {
      return { status: "matched", profileId: narrowed[0].id, isChild: narrowed[0].household_role === "child" };
    }
  }

  return { status: "unmatched" };
}

// A stable synthetic profile id for an attendee who couldn't be matched to a
// directory profile, scoped to one occurrence. Deliberately deterministic
// (not crypto.randomUUID()) — the (series_id, occurrence_date, profile_id)
// unique constraint is what makes re-importing idempotent, and that only
// holds if the *same* unmatched person gets the *same* synthetic id on every
// run. A random id here would mean every re-import (the daily-cron-plus-
// lookback design re-imports overlapping dates on purpose) creates a brand
// new duplicate guest row instead of updating the existing one.
function stableGuestId(occurrenceDate: string, attendee: AttendanceImportAttendee): string {
  const seed = `${occurrenceDate}:${normalizeName(attendee.name)}:${attendee.email?.trim().toLowerCase() ?? ""}`;
  return `guest:subsplash:${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

// Resolves the adult who dropped an attendee off ("[Checked in by]" in the
// export). Unlike the attendee's own email above, this one really is the
// adult's own contact info (they're the one who operated the check-in), so a
// direct, name-independent email match is safe here — worst case on a bad
// match is a wrong "dropped off by" display, not a misattributed attendance
// record. Falls back to a unique name match, then gives up (the row still
// keeps the plain-text name either way).
export function resolveDropOffAdult(
  attendee: AttendanceImportAttendee,
  lookup: ProfileLookup
): { profileId: string } | null {
  if (attendee.droppedOffByEmail) {
    const matches = lookup.byEmail.get(attendee.droppedOffByEmail.trim().toLowerCase());
    if (matches?.length === 1) return { profileId: matches[0].id };
  }
  if (attendee.droppedOffByName) {
    const matches = lookup.byName.get(normalizeName(attendee.droppedOffByName));
    if (matches?.length === 1) return { profileId: matches[0].id };
  }
  return null;
}

// Builds the lookup maps once per import run (not once per attendee) —
// profiles come from the already-cached full walk, so this is pure in-memory
// indexing, no repeated Subsplash calls.
export async function buildProfileLookup(): Promise<ProfileLookup> {
  const { profiles } = await searchProfiles({ pageSize: 5000 });
  return indexProfiles(profiles);
}

// Split out from buildProfileLookup so tests can index a fixed profile list
// without going through searchProfiles/mock data.
export function indexProfiles(profiles: Profile[]): ProfileLookup {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const byEmail = new Map<string, Profile[]>();
  const byName = new Map<string, Profile[]>();
  for (const p of profiles) {
    if (p.email) {
      const key = p.email.trim().toLowerCase();
      byEmail.set(key, [...(byEmail.get(key) ?? []), p]);
    }
    const nameKey = normalizeName(`${p.first_name} ${p.last_name}`);
    byName.set(nameKey, [...(byName.get(nameKey) ?? []), p]);
  }
  return { byId, byEmail, byName };
}

// --- Import run persistence (attendance_imports table) ---
// Mirrors lib/attendance.ts's isDbConfigured()/mock-store split (ADR-0015)
// so this module works the same in local dev (no DATABASE_URL) as in prod.

export interface AttendanceImportRun {
  seriesId: string;
  occurrenceDate: string;
  ranAt: string; // ISO 8601
  rowsSeen: number;
  rowsMatched: number;
  rowsUnmatched: number;
  unmatchedNames: string[];
  error: string | null;
}

function fromImportRow(row: AttendanceImportRow): AttendanceImportRun {
  return {
    seriesId: row.seriesId,
    occurrenceDate: row.occurrenceDate,
    ranAt: row.ranAt.toISOString(),
    rowsSeen: row.rowsSeen,
    rowsMatched: row.rowsMatched,
    rowsUnmatched: row.rowsUnmatched,
    unmatchedNames: row.unmatchedNames,
    error: row.error,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __mockAttendanceImports: AttendanceImportRun[] | undefined;
}

function mockImportStore(): AttendanceImportRun[] {
  return (globalThis.__mockAttendanceImports ??= []);
}

async function recordImportRun(input: {
  source: string;
  seriesId: string;
  occurrenceDate: string;
  rowsSeen: number;
  rowsMatched: number;
  rowsUnmatched: number;
  unmatchedNames: string[];
  error: string | null;
}): Promise<AttendanceImportRun> {
  if (isDbConfigured()) {
    const db = getDb();
    const [row] = await db.insert(attendanceImports).values(input).returning();
    return fromImportRow(row);
  }
  const run: AttendanceImportRun = {
    seriesId: input.seriesId,
    occurrenceDate: input.occurrenceDate,
    ranAt: new Date().toISOString(),
    rowsSeen: input.rowsSeen,
    rowsMatched: input.rowsMatched,
    rowsUnmatched: input.rowsUnmatched,
    unmatchedNames: input.unmatchedNames,
    error: input.error,
  };
  mockImportStore().push(run);
  return run;
}

// Last import run for a series (most recent occurrence_date first, so the
// Reports UI can show "imported as of <date>" plus any outstanding unmatched
// names) — used by GET /api/attendance/imports.
export async function lastImportRunForSeries(seriesId: string): Promise<AttendanceImportRun | null> {
  if (isDbConfigured()) {
    const db = getDb();
    const rows = await db
      .select()
      .from(attendanceImports)
      .where(eq(attendanceImports.seriesId, seriesId));
    if (rows.length === 0) return null;
    rows.sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime());
    return fromImportRow(rows[0]);
  }
  const runs = mockImportStore().filter((r) => r.seriesId === seriesId);
  if (runs.length === 0) return null;
  return runs.slice().sort((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
}

export interface ImportOccurrenceResult {
  occurrenceDate: string;
  seriesId: string | null;
  matched: number;
  unmatched: number;
  unmatchedNames: string[];
  error: string | null;
}

// Imports one occurrence's attendee list: resolves the series, then resolves
// and records each attendee. An attendee who can't be matched to a directory
// profile is still recorded — as a guest row, keyed by their exported name —
// so the occurrence's *total* stays correct even though that one person
// isn't credited against their real profile. Silently dropping them instead
// would undercount the occurrence and, worse, never surface the mismatch for
// anyone to fix.
export async function importOccurrence(
  occurrence: AttendanceImportOccurrence,
  lookup: ProfileLookup,
  source: string
): Promise<ImportOccurrenceResult> {
  const resolved = await resolveOccurrence({
    subsplashEventId: occurrence.subsplashEventId,
    eventTitle: occurrence.eventTitle,
    occurrenceDate: occurrence.occurrenceDate,
  });

  if (!resolved) {
    const error = `Could not resolve event/series for "${occurrence.eventTitle ?? occurrence.subsplashEventId ?? "unknown"}" on ${occurrence.occurrenceDate}`;
    await recordImportRun({
      source,
      seriesId: occurrence.subsplashEventId ?? occurrence.eventTitle ?? "unknown",
      occurrenceDate: occurrence.occurrenceDate,
      rowsSeen: occurrence.attendees.length,
      rowsMatched: 0,
      rowsUnmatched: occurrence.attendees.length,
      unmatchedNames: occurrence.attendees.map((a) => a.name),
      error,
    });
    return {
      occurrenceDate: occurrence.occurrenceDate,
      seriesId: null,
      matched: 0,
      unmatched: occurrence.attendees.length,
      unmatchedNames: occurrence.attendees.map((a) => a.name),
      error,
    };
  }

  let matched = 0;
  const unmatchedNames: string[] = [];

  for (const attendee of occurrence.attendees) {
    const resolution = resolveAttendee(attendee, lookup);
    const dropOffAdult = resolveDropOffAdult(attendee, lookup);
    const shared = {
      seriesId: resolved.seriesId,
      eventId: resolved.eventId,
      occurrenceDate: occurrence.occurrenceDate,
      displayName: attendee.name,
      sessionName: attendee.sessionName ?? null,
      checkedInAt: attendee.checkedInAt,
      checkedInBy: `import:${source}`,
      droppedOffByProfileId: dropOffAdult?.profileId ?? null,
      droppedOffByName: attendee.droppedOffByName ?? null,
      matchCode: attendee.matchCode ?? null,
      checkedOutAt: attendee.checkedOutAt ?? null,
      method: "subsplash" as const,
    };

    if (resolution.status === "matched") {
      matched++;
      await recordCheckIn({
        ...shared,
        profileId: resolution.profileId,
        isChild: attendee.isChild ?? resolution.isChild,
      });
    } else {
      unmatchedNames.push(attendee.name);
      await recordCheckIn({
        ...shared,
        profileId: stableGuestId(occurrence.occurrenceDate, attendee),
        isChild: attendee.isChild ?? false,
        isGuest: true,
      });
    }
  }

  await recordImportRun({
    source,
    seriesId: resolved.seriesId,
    occurrenceDate: occurrence.occurrenceDate,
    rowsSeen: occurrence.attendees.length,
    rowsMatched: matched,
    rowsUnmatched: unmatchedNames.length,
    unmatchedNames,
    error: null,
  });

  return {
    occurrenceDate: occurrence.occurrenceDate,
    seriesId: resolved.seriesId,
    matched,
    unmatched: unmatchedNames.length,
    unmatchedNames,
    error: null,
  };
}

// Imports every occurrence in a request, sharing one profile-lookup build
// across all of them (the whole point of ADR-0009's cache — this generates
// zero additional Subsplash traffic regardless of how many occurrences or
// attendees are in the payload).
export async function runAttendanceImport(request: AttendanceImportRequest): Promise<ImportOccurrenceResult[]> {
  const lookup = await buildProfileLookup();
  const results: ImportOccurrenceResult[] = [];
  for (const occurrence of request.occurrences) {
    results.push(await importOccurrence(occurrence, lookup, request.source));
  }
  return results;
}
