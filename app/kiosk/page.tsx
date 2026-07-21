import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DEVICE_COOKIE_NAME, getAttendanceActor } from "@/lib/deviceAuth";
import { getEvent, listTodaysEvents } from "@/lib/events";
import { KioskCheckInClient } from "@/components/KioskCheckInClient";
import { KioskEventPicker } from "@/components/KioskEventPicker";

// Kiosk mode (ADR-0015, Phase 2 & 3): entered two ways — (a) a signed-in
// staff/volunteer taps "Start kiosk" on a today's-event card, arriving with
// ?eventId set, or (b) an authorized device lands here directly with no
// session at all, resolved from its kiosk_device cookie. Deliberately
// outside the (dashboard) layout — no Sidebar, no nav, full-bleed.
export default async function KioskPage({
  searchParams,
}: {
  searchParams: { eventId?: string };
}) {
  const deviceToken = (await cookies()).get(DEVICE_COOKIE_NAME)?.value;
  const actor = await getAttendanceActor(deviceToken);
  // Neither a session nor a valid device cookie — this is either a brand-new
  // device or a stray visitor; either way, setup is the only useful next
  // step (middleware.ts exempts /kiosk/* from the sign-in redirect exactly
  // so this page can send them here instead of /login).
  if (!actor) redirect("/kiosk/setup");

  const isDevice = actor.type === "device";

  const eventId = searchParams.eventId;
  if (eventId) {
    const event = await getEvent(eventId);
    if (!event) notFound();
    return <KioskCheckInClient event={event} isDevice={isDevice} />;
  }

  if (actor.type === "user") {
    // A signed-in operator launches kiosk from a specific event's "Start
    // kiosk" button on /events — arriving here with nothing selected means
    // they navigated to /kiosk directly.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-brand-navy px-6 text-center">
        <p className="text-[15px] text-brand-cream">No event selected for kiosk mode.</p>
        <a href="/events" className="text-[13.5px] font-semibold text-brand-cream underline underline-offset-2">
          Back to events
        </a>
      </div>
    );
  }

  // A device has no access to /events — it picks straight from today's
  // check-in-enabled events itself.
  const todaysEvents = await listTodaysEvents();
  if (todaysEvents.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-brand-navy px-6 text-center">
        <p className="text-[15px] text-brand-cream">No check-in events today.</p>
      </div>
    );
  }
  if (todaysEvents.length === 1) {
    return <KioskCheckInClient event={todaysEvents[0]} />;
  }
  return <KioskEventPicker events={todaysEvents} />;
}
