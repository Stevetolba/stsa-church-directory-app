import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getEvent } from "@/lib/events";
import { profileVisibleToVolunteer } from "@/lib/subsplash";
import { listCheckIns, summarize } from "@/lib/attendance";
import type { Role } from "@/types/auth";

// ADR-0021. Attendance is captured in Subsplash Check-In and imported here
// (see /api/attendance/import) — this route is now read-only: who's checked
// in for an occurrence. Volunteers are gated per-record to profiles they can
// already see in the children directory (profileVisibleToVolunteer), same
// rule the check-in flow used to enforce. Reports/absentees/email live on
// separate staff-only routes.

interface Actor {
  email: string;
  role: Role;
}

async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  return { email: session.user.email, role: session.user.role };
}

// A volunteer may see a record only if it's a guest or visible to them.
async function volunteerMayView(actor: Actor, profileId: string, isGuest: boolean): Promise<boolean> {
  if (actor.role !== "volunteer") return true;
  if (isGuest) return true;
  return profileVisibleToVolunteer(profileId);
}

// GET /api/attendance?eventId=... — who's checked in for this occurrence.
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let records = await listCheckIns(event.series_id, event.occurrence_date);
  if (actor.role === "volunteer") {
    const visible = await Promise.all(
      records.map((r) => volunteerMayView(actor, r.profileId, r.isGuest))
    );
    records = records.filter((_, i) => visible[i]);
  }
  return NextResponse.json({ event, records, summary: summarize(records) });
}
