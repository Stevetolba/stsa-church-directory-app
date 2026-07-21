import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEvent, listOccurrences } from "@/lib/events";
import { occurrenceDateInTz } from "@/lib/eventTime";
import { getFromAddress } from "@/lib/email";
import { AttendanceReportClient } from "@/components/AttendanceReportClient";

// ADR-0015 (Phase 4 & 5): staff/admin-only attendance report for one series,
// entered via a specific occurrence's event id (from /reports, or later a
// per-event link) — the report itself operates on the whole series
// (event.series_id), this id just anchors which series and supplies a
// default occurrence to open on.
export default async function EventReportPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role === "volunteer") {
    redirect("/");
  }

  const event = await getEvent(params.id);
  if (!event) notFound();

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

  return (
    <AttendanceReportClient event={event} occurrences={occurrences} user={user} fromAddress={getFromAddress()} />
  );
}
