import { auth } from "@/lib/auth";
import { EventsPageClient } from "@/components/EventsPageClient";

export default async function EventsPage() {
  const session = await auth();
  // Attendance reports are staff/admin only for most series, but a
  // volunteer (including a Team Lead) may view the Sunday School series
  // specifically (lib/reportAccess.ts / requireReportAccess) — so the
  // "Report" link's visibility now depends on both role and which event's
  // card it's on, computed per-card in EventCard rather than as one
  // page-wide boolean.
  const role = session?.user?.role ?? "volunteer";
  // Google Calendar sync (ADR-0022) writes to a shared public calendar, so
  // it's admin-only, same as the attendance CSV upload button.
  const isAdmin = role === "admin";
  return <EventsPageClient role={role} isAdmin={isAdmin} />;
}
