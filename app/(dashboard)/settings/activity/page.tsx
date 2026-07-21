import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ActivityLog } from "@/components/ActivityLog";

// Admin-only audit trail (ADR-0016). requireAdmin() is the real guard on
// /api/access-events; this redirect just keeps a staff/volunteer from
// landing on a page that would only 403 against them (same pattern as
// settings/devices/page.tsx).
export default async function ActivitySettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/");
  }

  return <ActivityLog />;
}
