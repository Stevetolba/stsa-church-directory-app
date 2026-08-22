import { NextResponse, type NextRequest } from "next/server";
import { requireStaffOrAdmin } from "@/lib/rbac";
import { lastImportRunForSeries } from "@/lib/attendanceImport";

// ADR-0021. Staff/admin-only: the most recent Subsplash attendance-import run
// for a series, so the report page can show "Imported from Subsplash · <when>"
// and surface any attendees that couldn't be matched to a directory profile.
export async function GET(request: NextRequest) {
  const forbidden = await requireStaffOrAdmin("attendance-import-status");
  if (forbidden) return forbidden;

  const seriesId = new URL(request.url).searchParams.get("seriesId");
  if (!seriesId) return NextResponse.json({ error: "seriesId is required" }, { status: 400 });

  const run = await lastImportRunForSeries(seriesId);
  return NextResponse.json({ run });
}
