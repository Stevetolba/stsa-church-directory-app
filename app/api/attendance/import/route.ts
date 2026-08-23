import { NextResponse, type NextRequest } from "next/server";
import { runAttendanceImport } from "@/lib/attendanceImport";
import { isAuthorizedForAttendanceImport } from "@/lib/attendanceImportAuth";
import { attendanceImportRequestSchema } from "@/lib/validation/attendance";

// ADR-0021. Ingests one attendance-sync run from the Subsplash Check-In
// dashboard export (scripts/sync-subsplash-attendance.ts). Idempotent:
// recordCheckIn's (series_id, occurrence_date, profile_id) unique constraint
// means re-importing the same occurrence just updates the existing rows
// rather than duplicating them.

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedForAttendanceImport(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = attendanceImportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const results = await runAttendanceImport(parsed.data);
  return NextResponse.json({ results });
}
