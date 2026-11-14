import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireReportAccess } from "@/lib/rbac";
import { SUNDAY_SCHOOL_SERIES_BY_CAMPUS } from "@/lib/reportAccess";
import { runWeeklyAttendanceReports } from "@/lib/weeklyAttendanceReport";
import type { Campus } from "@/types/profile";

const schema = z.object({
  seriesId: z.string().trim().min(1),
  to: z.string().trim().email().max(254),
});

// Sends the weekly Sunday School attendance report (same content as the
// Team Lead email) to one address on demand. Doesn't touch the send-once
// tracking, so it never blocks or duplicates the scheduled send.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { seriesId, to } = parsed.data;

  const campus = (Object.keys(SUNDAY_SCHOOL_SERIES_BY_CAMPUS) as Campus[]).find(
    (c) => SUNDAY_SCHOOL_SERIES_BY_CAMPUS[c as "Arlington" | "Leesburg"] === seriesId
  );
  if (!campus) return NextResponse.json({ error: "Only Sunday School reports can be emailed." }, { status: 400 });

  const forbidden = await requireReportAccess(seriesId, "attendance-report-email");
  if (forbidden) return forbidden;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const result = await runWeeklyAttendanceReports(`${proto}://${host}`, new Date(), {
    force: true,
    onlyTo: to,
    onlyCampus: campus,
  });
  const status = result.campuses[0];
  if (status?.status !== "sent") {
    const reason =
      status?.status === "waiting for import"
        ? "Last Sunday's attendance hasn't been imported yet."
        : status?.status === "no class"
          ? "There was no class last Sunday."
          : (status?.error ?? "Could not send the report.");
    return NextResponse.json({ error: reason }, { status: 409 });
  }
  return NextResponse.json({ sent: true });
}
