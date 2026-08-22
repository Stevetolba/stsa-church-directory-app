import { NextResponse, type NextRequest } from "next/server";
import { listSeries } from "@/lib/events";
import { isAuthorizedForAttendanceImport } from "@/lib/attendanceImportAuth";

// ADR-0021. Lets scripts/scheduled-sync-subsplash.ts discover which
// check-in-enabled series to sync, without importing lib/events.ts directly —
// that module uses Next.js's unstable_cache, which throws
// ("incrementalCache missing") outside a running Next.js server, so a
// standalone tsx script can't call listSeries() in-process. This route runs
// inside the real Next.js server, where the cache works, and the script just
// hits it over HTTP like any other client — the same shape as it already
// POSTs to /api/attendance/import. Same auth as that route (bearer token or
// admin session), since series titles/ids aren't sensitive but this is still
// an unauthenticated-by-default surface otherwise.
export async function GET(request: NextRequest) {
  if (!(await isAuthorizedForAttendanceImport(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const series = await listSeries();
  return NextResponse.json({ series });
}
