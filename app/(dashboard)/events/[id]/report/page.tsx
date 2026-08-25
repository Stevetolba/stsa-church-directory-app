import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEvent, listOccurrences } from "@/lib/events";
import { occurrenceDateInTz } from "@/lib/eventTime";
import { getFromAddress } from "@/lib/email";
import { isSundaySchoolSeriesId } from "@/lib/reportAccess";
import { AttendanceReportClient } from "@/components/AttendanceReportClient";

// ADR-0015 (Phase 4 & 5): attendance report for one series, entered via a
// specific occurrence's event id (from /reports, or later a per-event link)
// — the report itself operates on the whole series (event.series_id), this
// id just anchors which series and supplies a default occurrence to open
// on. Staff/admin can view any series; a volunteer only a Sunday School
// series (they need to see their own class's attendance) — matches
// requireReportAccess's server-side gate on the underlying report/
// absentees/import-status API routes, which is the actual enforcement
// (ADR-0005: this redirect is just UX, not the guard).
export default async function EventReportPage({ params }: { params: { id: string } }) {
  const session = await auth();

  const event = await getEvent(params.id);
  if (!event) notFound();

  const role = session?.user?.role;
  if (role === "volunteer" && !isSundaySchoolSeriesId(event.series_id)) {
    redirect("/");
  }

  // Bounded to today: a series with many scheduled future occurrences
  // (listOccurrences pulls up to ~180 days ahead) would otherwise fill the
  // whole limit=24 with far-future dates before ever reaching a real one —
  // a report picker is about reviewing what already happened.
  const today = occurrenceDateInTz(new Date().toISOString(), event.timezone);
  const occurrences = await listOccurrences(event.series_id, { to: today, limit: 24 });

  // Layout already redirects unauthenticated requests before this renders,
  // so session.user is present — the fallbacks are defense in depth (same
  // pattern as app/(dashboard)/children/page.tsx's Email Parents wiring).
  const user = {
    name: session?.user?.name ?? session?.user?.email ?? "Staff",
    email: session?.user?.email ?? "",
  };
  const isAdmin = role === "admin";
  // Sending absentee emails stays staff/admin only regardless of series —
  // a volunteer can view the Sunday School roster but not email families
  // (POST /api/attendance/email is requireStaffOrAdmin unconditionally).
  const canEmail = role === "admin" || role === "staff";

  return (
    <AttendanceReportClient
      event={event}
      occurrences={occurrences}
      user={user}
      fromAddress={getFromAddress()}
      isAdmin={isAdmin}
      canEmail={canEmail}
    />
  );
}
