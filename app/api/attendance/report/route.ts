import { NextResponse, type NextRequest } from "next/server";
import { requireStaffOrAdmin } from "@/lib/rbac";
import { listCheckIns, listCheckInsForSeries, summarize, summarizeSeriesFrequency } from "@/lib/attendance";
import { listOccurrences } from "@/lib/events";

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
  const forbidden = await requireStaffOrAdmin();
  if (forbidden) return forbidden;

  const { searchParams } = new URL(request.url);
  const seriesId = searchParams.get("seriesId");
  if (!seriesId) return NextResponse.json({ error: "seriesId is required" }, { status: 400 });

  const occurrenceDate = searchParams.get("occurrenceDate");
  if (occurrenceDate) {
    const records = await listCheckIns(seriesId, occurrenceDate);
    return NextResponse.json({ occurrenceDate, records, summary: summarize(records) });
  }

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "Provide occurrenceDate, or both from and to" }, { status: 400 });
  }

  const occurrences = await listOccurrences(seriesId, { from, to });
  const occurrenceDates = occurrences.map((o) => o.occurrence_date);
  const records = await listCheckInsForSeries(seriesId, from, to);
  return NextResponse.json(summarizeSeriesFrequency(records, occurrenceDates));
}
