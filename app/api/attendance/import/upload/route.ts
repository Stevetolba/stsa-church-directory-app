import { NextResponse, type NextRequest } from "next/server";
import { runAttendanceImport } from "@/lib/attendanceImport";
import { isAuthorizedForAttendanceImport } from "@/lib/attendanceImportAuth";
import { parseSubsplashCheckInsCsv } from "@/lib/subsplashExportCsv";
import { attendanceImportRequestSchema } from "@/lib/validation/attendance";

// ADR-0021. The in-app counterpart to scripts/sync-subsplash-attendance.ts:
// an admin exports a Subsplash Check-In CSV by hand and uploads it straight
// from the report page, instead of running the CLI script. Same parser
// (lib/subsplashExportCsv.ts) and the same idempotent import
// (lib/attendanceImport.ts), just fed from a browser file upload instead of
// a local file path — so re-uploading the same export is exactly as safe as
// re-running the script.
export async function POST(request: NextRequest) {
  if (!(await isAuthorizedForAttendanceImport(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const seriesId = form?.get("seriesId");
  const timeZone = form?.get("timezone");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A CSV file is required" }, { status: 400 });
  }
  if (typeof seriesId !== "string" || !seriesId.trim()) {
    return NextResponse.json({ error: "seriesId is required" }, { status: 400 });
  }

  const csvText = await file.text();
  const { occurrences, skipped } = parseSubsplashCheckInsCsv(csvText, {
    timeZone: typeof timeZone === "string" && timeZone.trim() ? timeZone : "America/New_York",
    subsplashEventId: seriesId,
  });

  if (occurrences.length === 0) {
    return NextResponse.json({ results: [], skipped });
  }

  const parsed = attendanceImportRequestSchema.safeParse({ source: "subsplash", occurrences });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid export file" }, { status: 400 });
  }

  const results = await runAttendanceImport(parsed.data);
  return NextResponse.json({ results, skipped });
}
