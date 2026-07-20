import { NextResponse, type NextRequest } from "next/server";
import { getAttendanceActorFromRequest } from "@/lib/deviceAuth";
import { listTodaysEvents } from "@/lib/events";

// ADR-0015 (Phase 3): today's check-in-enabled events for the kiosk entry
// screen. Reachable by a device cookie as well as a signed-in session, so an
// unattended iPad can list and pick today's event itself.
export async function GET(request: NextRequest) {
  const actor = await getAttendanceActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ events: await listTodaysEvents() });
}
