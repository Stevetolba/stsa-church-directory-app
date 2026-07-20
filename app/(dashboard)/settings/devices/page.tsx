import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DeviceManager } from "@/components/DeviceManager";

// Admin-only device management (ADR-0015, Phase 3): generate/revoke the
// setup codes that authorize a kiosk device (/kiosk/setup) without anyone
// signing in on it. requireAdmin() is the real guard on /api/devices*; this
// redirect just keeps a staff/volunteer from landing on a page that would
// only 403 against them.
export default async function DevicesSettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/");
  }

  return <DeviceManager />;
}
