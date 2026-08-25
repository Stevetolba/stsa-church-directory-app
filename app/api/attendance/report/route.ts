import { NextResponse, type NextRequest } from "next/server";
import { requireReportAccess } from "@/lib/rbac";
import {
  attachGrades,
  filterRecordsByProfileIds,
  listCheckIns,
  listCheckInsForSeries,
  matchingProfileIds,
  summarize,
  summarizeSeriesFrequency,
} from "@/lib/attendance";
import { listOccurrences } from "@/lib/events";
import { isSundaySchoolSeriesId } from "@/lib/reportAccess";
import type { Campus, MemberStatus } from "@/types/profile";

// ADR-0015 (Phase 4): staff/admin-only reporting reads. Two modes on one
// route, matched by which query params are present:
//   ?seriesId=&occurrenceDate=   -> a single occurrence's full record list
//     (records + summary), same shape as GET /api/attendance but keyed
//     directly by (series, date) instead of an event id — so a date that's
//     only known from a backfilled check-in (no resolvable Subsplash event,
//     see lib/events.ts SeriesOccurrence.hasEvent) still works here, unlike
//     /api/attendance which requires getEvent() to succeed.
//   ?seriesId=&from=&to=         -> the series frequency report: every
//     occurrence in the range (from lib/events.listOccurrences, the true
//     denominator) plus, per person, which of those they attended.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seriesId = searchParams.get("seriesId");
  if (!seriesId) return NextResponse.json({ error: "seriesId is required" }, { status: 400 });

  const forbidden = await requireReportAccess(seriesId, "attendance-report");
  if (forbidden) return forbidden;

  // Campus/Status/Grade/Age filters (report page's FilterPill/AddFilterMenu
  // bar) resolve to a set of eligible profile ids, since check-in rows
  // don't carry those fields themselves — see matchingProfileIds.
  const campus = searchParams.getAll("campus") as Campus[];
  const status = searchParams.getAll("status") as MemberStatus[];
  const gradeFromRaw = searchParams.get("gradeFrom");
  const gradeToRaw = searchParams.get("gradeTo");
  const gradeFrom = gradeFromRaw ? Number(gradeFromRaw) : undefined;
  const gradeTo = gradeToRaw ? Number(gradeToRaw) : undefined;
  const ageFromRaw = searchParams.get("ageFrom");
  const ageToRaw = searchParams.get("ageTo");
  const ageFrom = ageFromRaw ? Number(ageFromRaw) : undefined;
  const ageTo = ageToRaw ? Number(ageToRaw) : undefined;
  const ids = await matchingProfileIds({ campus, status, gradeFrom, gradeTo, ageFrom, ageTo });

  const occurrenceDate = searchParams.get("occurrenceDate");
  if (occurrenceDate) {
    const records = filterRecordsByProfileIds(await listCheckIns(seriesId, occurrenceDate), ids);
    return NextResponse.json({ occurrenceDate, records, summary: summarize(records) });
  }

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "Provide occurrenceDate, or both from and to" }, { status: 400 });
  }

  const occurrences = await listOccurrences(seriesId, { from, to });
  const occurrenceDates = occurrences.map((o) => o.occurrence_date);
  const records = filterRecordsByProfileIds(await listCheckInsForSeries(seriesId, from, to), ids);
  const result = summarizeSeriesFrequency(records, occurrenceDates);
  // Grade is a Sunday-School-only column (components/AttendanceReportClient.tsx's
  // Series tab) — skip the extra profile-roster fetch entirely for every
  // other series, which would otherwise be discarded unused.
  const people = isSundaySchoolSeriesId(seriesId) ? await attachGrades(result.people) : result.people;
  return NextResponse.json({ ...result, people });
}
