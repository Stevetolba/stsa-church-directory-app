import { NextResponse, type NextRequest } from "next/server";
import { requireReportAccess } from "@/lib/rbac";
import { lastImportRunForSeries } from "@/lib/attendanceImport";

// ADR-0021. The most recent Subsplash attendance-import run for a series, so
// the report page can show "Imported from Subsplash · <when>" and surface
// any attendees that couldn't be matched to a directory profile. Staff/admin
// for any series; a volunteer only for the Sunday School series they're
// otherwise allowed to view (see requireReportAccess).
export async function GET(request: NextRequest) {
  const seriesId = new URL(request.url).searchParams.get("seriesId");
  if (!seriesId) return NextResponse.json({ error: "seriesId is required" }, { status: 400 });

  const forbidden = await requireReportAccess(seriesId, "attendance-import-status");
  if (forbidden) return forbidden;

  const run = await lastImportRunForSeries(seriesId);
  return NextResponse.json({ run });
}
