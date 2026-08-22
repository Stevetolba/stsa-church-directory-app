import { auth } from "@/lib/auth";
import { EventsPageClient } from "@/components/EventsPageClient";

export default async function EventsPage() {
  const session = await auth();
  // Attendance reports are staff/admin only (ADR-0015's RBAC table, enforced
  // by requireStaffOrAdmin on the report routes) — volunteers still see the
  // events list itself, just without the report links.
  const role = session?.user?.role;
  const canViewReports = role === "admin" || role === "staff";
  return <EventsPageClient canViewReports={canViewReports} />;
}
