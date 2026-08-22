import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { runAttendanceImport } from "@/lib/attendanceImport";
import { attendanceImportRequestSchema } from "@/lib/validation/attendance";

// ADR-0021. Ingests one attendance-sync run from the Subsplash Check-In
// dashboard export (scripts/sync-subsplash-attendance.mjs). Two ways in:
//   - Authorization: Bearer <ATTENDANCE_IMPORT_TOKEN> — the scheduled sync
//     job, which has no user session.
//   - An admin's own signed-in session — so an import can also be re-run by
//     hand (e.g. re-POSTing a payload while debugging an unmatched name)
//     without minting a token for a person.
// Idempotent: recordCheckIn's (series_id, occurrence_date, profile_id)
// unique constraint means re-importing the same occurrence just updates the
// existing rows rather than duplicating them.

function bearerTokenMatches(request: NextRequest): boolean {
  const expected = process.env.ATTENDANCE_IMPORT_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch rather than returning false —
  // guard that first so a wrong-length token doesn't 500 the request.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  let authorized = bearerTokenMatches(request);
  if (!authorized) {
    const session = await auth();
    authorized = session?.user?.role === "admin";
  }
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = attendanceImportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const results = await runAttendanceImport(parsed.data);
  return NextResponse.json({ results });
}
