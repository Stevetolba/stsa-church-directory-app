import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEvent } from "@/lib/events";
import { KioskCheckInClient } from "@/components/KioskCheckInClient";

// Signed-in kiosk mode (ADR-0015, Phase 2): a staff/volunteer locks a device
// into a self-service check-in/out screen for one event, entered from the
// "Kiosk" button on a today's-event card. Deliberately outside the
// (dashboard) layout — no Sidebar, no nav, full-bleed. Device-authorized
// (no-sign-in) kiosk access is Phase 3.
export default async function KioskPage({
  searchParams,
}: {
  searchParams: { eventId?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const eventId = searchParams.eventId;
  if (!eventId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-brand-navy px-6 text-center">
        <p className="text-[15px] text-brand-cream">No event selected for kiosk mode.</p>
        <a href="/events" className="text-[13.5px] font-semibold text-brand-cream underline underline-offset-2">
          Back to events
        </a>
      </div>
    );
  }

  const event = await getEvent(eventId);
  if (!event) notFound();

  return <KioskCheckInClient event={event} role={session.user.role} />;
}
