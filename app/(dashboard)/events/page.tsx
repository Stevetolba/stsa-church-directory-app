import { auth } from "@/lib/auth";
import { EventsPageClient } from "@/components/EventsPageClient";

export default async function EventsPage() {
  const session = await auth();
  // Any authenticated role can run check-in (children's-ministry volunteers
  // included) — attendance data itself is guarded server-side per record.
  // "Start kiosk" is available to everyone signed in; device-authorized
  // (no-login) kiosks are set up separately by an admin (ADR-0015).
  const canStartKiosk = !!session?.user;
  return <EventsPageClient canStartKiosk={canStartKiosk} />;
}
