import { NextResponse, type NextRequest } from "next/server";
import { requireReportAccess, requireStaffOrAdmin } from "@/lib/rbac";
import { findAbsentees, resolveAbsenteeEmails } from "@/lib/attendance";
import { listOccurrences } from "@/lib/events";
import { occurrenceDateInTz } from "@/lib/eventTime";
import type { Campus, MemberStatus } from "@/types/profile";

const DEFAULT_LAST_N = 4;
const MAX_LAST_N = 52;

// ADR-0015 (Phase 4): who's missed the last N occurrences of a series —
// staff/admin only. Distinct from the series frequency report
// (/api/attendance/report?seriesId&from&to): that's a GROUP BY over
// check-ins, so someone who has never once attended never appears in it.
// This route instead starts from the roster (Subsplash) and subtracts
// whoever attended, so a true zero-attendance person is visible too.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seriesId = searchParams.get("seriesId");
  if (!seriesId) return NextResponse.json({ error: "seriesId is required" }, { status: 400 });

  // includeParents resolves actual parent/guardian contact emails (for the
  // email-compose dialog's recipient preview) — that stays staff/admin only
  // even for a Sunday School series a volunteer can otherwise view, since
  // volunteers can never send absentee emails (POST /api/attendance/email
  // is requireStaffOrAdmin unconditionally) and shouldn't get raw contact
  // info they can't act on anyway. The plain roster (no includeParents)
  // uses the looser Sunday-School-aware gate.
  const includeParents = searchParams.get("includeParents") === "true";
  const forbidden = includeParents
    ? await requireStaffOrAdmin("attendance-absentees")
    : await requireReportAccess(seriesId, "attendance-absentees");
  if (forbidden) return forbidden;

  const lastNRaw = Number(searchParams.get("lastN") ?? DEFAULT_LAST_N);
  const lastN = Number.isFinite(lastNRaw) && lastNRaw > 0 ? Math.min(lastNRaw, MAX_LAST_N) : DEFAULT_LAST_N;
  const childrenOnlyRaw = searchParams.get("childrenOnly");
  const childrenOnly = childrenOnlyRaw === null ? undefined : childrenOnlyRaw === "true";
  const search = searchParams.get("search") ?? undefined;
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

  // Bounded to today (UTC — close enough for "last N occurrences"; unlike
  // the occurrence report's exact-date picker, a day of slop at a timezone
  // boundary doesn't matter here): without this, a series with many
  // scheduled future occurrences would have listOccurrences' plain
  // descending-date-then-limit return the furthest-future N instead of the
  // most recent past N.
  const today = occurrenceDateInTz(new Date().toISOString(), "UTC");
  const occurrences = await listOccurrences(seriesId, { to: today, limit: lastN });
  const occurrenceDates = occurrences.map((o) => o.occurrence_date);
  const absentees = await findAbsentees({
    seriesId,
    occurrenceDates,
    childrenOnly,
    search,
    campus,
    status,
    gradeFrom,
    gradeTo,
    ageFrom,
    ageTo,
  });

  // Only resolved on request (ADR-0015 Phase 5) — the report page's
  // Absentees tab doesn't need it and shouldn't pay for the extra
  // parent-contact lookup on every load; the email compose dialog asks for
  // it explicitly so its recipient preview matches exactly what
  // /api/attendance/email will actually send.
  if (includeParents) {
    const recipientEmails = Array.from(await resolveAbsenteeEmails(absentees)).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ occurrenceDates, absentees, recipientEmails });
  }
  return NextResponse.json({ occurrenceDates, absentees });
}
