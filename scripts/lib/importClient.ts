// Shared by scripts/sync-subsplash-attendance.ts (manual CSV) and
// scripts/scheduled-sync-subsplash.ts (automated fetch) — both end up with
// the same thing, a list of parsed occurrences, and need to POST them to
// the app and report the outcome the same way.

import type { AttendanceImportOccurrence } from "../../lib/validation/attendance";
import type { ParsedRowIssue } from "../../lib/subsplashExportCsv";

export interface SeriesForSync {
  seriesId: string;
  title: string;
}

// GET /api/attendance/series — discovers which check-in-enabled series to
// sync. Goes over HTTP to the running app rather than importing lib/events.ts
// directly: that module uses Next.js's unstable_cache, which only works
// inside a live Next.js server, not a standalone tsx script process.
export async function fetchCheckInEnabledSeries(baseUrl: string, token: string): Promise<SeriesForSync[]> {
  const res = await fetch(new URL("/api/attendance/series", baseUrl), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET /api/attendance/series failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { series: SeriesForSync[] };
  return data.series;
}

export interface ImportOccurrenceResult {
  occurrenceDate: string;
  seriesId: string | null;
  matched: number;
  unmatched: number;
  unmatchedNames: string[];
  error: string | null;
}

export async function postOccurrence(
  baseUrl: string,
  token: string,
  occurrence: AttendanceImportOccurrence
): Promise<ImportOccurrenceResult> {
  const res = await fetch(new URL("/api/attendance/import", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ source: "subsplash", occurrences: [occurrence] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`POST /api/attendance/import failed for ${occurrence.occurrenceDate}: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { results: ImportOccurrenceResult[] };
  return data.results[0];
}

// Posts every occurrence, one at a time (so one bad occurrence — e.g. a
// title match failure — doesn't sink the rest of a multi-Sunday run; each
// POST is independent and idempotent, so a later re-run just retries what
// failed), logging a line per occurrence. Returns false if anything failed.
export async function postAndReportAll(
  baseUrl: string,
  token: string,
  occurrences: AttendanceImportOccurrence[],
  skipped: ParsedRowIssue[]
): Promise<boolean> {
  console.log(`Parsed ${occurrences.length} occurrence(s).`);
  if (skipped.length > 0) {
    console.warn(`${skipped.length} row(s) skipped (couldn't parse):`);
    for (const s of skipped) console.warn(`  row ${s.rowNumber}: ${s.reason}`);
  }
  if (occurrences.length === 0) {
    console.log("Nothing to import.");
    return true;
  }

  let anyFailed = false;
  for (const occurrence of occurrences) {
    try {
      const result = await postOccurrence(baseUrl, token, occurrence);
      const unmatchedNote = result.unmatched > 0 ? ` (unmatched: ${result.unmatchedNames.join(", ")})` : "";
      console.log(
        `${occurrence.occurrenceDate}: ${result.matched} matched, ${result.unmatched} unmatched${unmatchedNote}`
      );
      if (result.error) {
        console.error(`${occurrence.occurrenceDate}: ${result.error}`);
        anyFailed = true;
      }
    } catch (err) {
      console.error(String(err));
      anyFailed = true;
    }
  }
  return !anyFailed;
}
