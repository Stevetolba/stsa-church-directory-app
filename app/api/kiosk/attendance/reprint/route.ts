import { NextResponse, type NextRequest } from "next/server";
import { getAttendanceActorFromRequest, type AttendanceActor } from "@/lib/deviceAuth";
import { getEvent } from "@/lib/events";
import { profileVisibleToVolunteer } from "@/lib/subsplash";
import { buildReprintLabelData, getCheckIn } from "@/lib/attendance";

function actorIsStaffOrAdmin(actor: AttendanceActor): boolean {
  return actor.type === "user" && (actor.role === "admin" || actor.role === "staff");
}

async function mayAct(actor: AttendanceActor, profileId: string, isGuest: boolean): Promise<boolean> {
  if (actorIsStaffOrAdmin(actor)) return true;
  if (isGuest) return true;
  return profileVisibleToVolunteer(profileId);
}

// GET /api/kiosk/attendance/reprint?eventId=&profileId= — same as
// /api/attendance/reprint, but reachable by a device actor (kiosk cookie),
// mirroring the existing GET/POST/PATCH split between /api/attendance and
// /api/kiosk/attendance. A device actor is scoped the same as a volunteer
// (ADR-0015): can only reprint a child-bearing-household profile it could
// already see on the kiosk roster, never an unrelated adult.
export async function GET(request: NextRequest) {
  const actor = await getAttendanceActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  const profileId = searchParams.get("profileId");
  if (!eventId || !profileId) {
    return NextResponse.json({ error: "eventId and profileId are required" }, { status: 400 });
  }

  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const isGuest = profileId.startsWith("guest:");
  if (!(await mayAct(actor, profileId, isGuest))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const record = await getCheckIn(event.series_id, event.occurrence_date, profileId);
  if (!record) return NextResponse.json({ error: "No check-in found to reprint" }, { status: 404 });

  const result = await buildReprintLabelData(record, event.title);
  return NextResponse.json(result);
}
