import { NextResponse, type NextRequest } from "next/server";
import { cronSecretMatches } from "@/lib/cronAuth";
import { runWeeklyAttendanceReports } from "@/lib/weeklyAttendanceReport";

// ADR-0028. Vercel Cron target (vercel.json `crons`) for the weekly Sunday
// School attendance email to Team Leads. Runs Wed–Sat once a day at 17:00 UTC
// (Vercel Hobby allows only daily crons: 12:00 EST / 13:00 EDT); the job only acts from Wednesday 12:00 America/New_York and sends each
// campus at most once per Sunday, retrying daily until the import has landed.
export async function GET(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? new URL(request.url).origin;
  const params = new URL(request.url).searchParams;
  // Dev-only testing hooks (never honored in production).
  const dev = process.env.NODE_ENV !== "production";
  const nowParam = dev ? params.get("now") : null;
  const result = await runWeeklyAttendanceReports(appUrl, nowParam ? new Date(nowParam) : new Date(), {
    force: dev && params.get("force") === "true",
    onlyTo: dev ? (params.get("onlyTo") ?? undefined) : undefined,
  });
  if (result.campuses.some((c) => c.status === "error")) console.error("Attendance report errors", result);
  return NextResponse.json(result);
}
