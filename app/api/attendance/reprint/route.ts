import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getEvent } from "@/lib/events";
import { profileVisibleToVolunteer } from "@/lib/subsplash";
import { buildReprintLabelData, getCheckIn } from "@/lib/attendance";
import type { Role } from "@/types/auth";

interface Actor {
  email: string;
  role: Role;
}

async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  return { email: session.user.email, role: session.user.role };
}

async function volunteerMayAct(actor: Actor, profileId: string, isGuest: boolean): Promise<boolean> {
  if (actor.role !== "volunteer") return true;
  if (isGuest) return true;
  return profileVisibleToVolunteer(profileId);
}

// GET /api/attendance/reprint?eventId=&profileId= — rebuilds the printable
// label data for someone already checked in, for a "Reprint label" action.
// A separate endpoint (mirroring the existing GET/POST/PATCH/DELETE split on
// /api/attendance) rather than a param on the roster GET, since it answers a
// different question ("this one person's label") and needs a server round-
// trip regardless of what the client already has cached — allergy/care
// notes and the drop-off adult's phone were only ever returned in the
// original check-in POST response, never persisted or included in roster
// reads, so they're always re-fetched here rather than trusted from
// whatever the client happens to still hold (see buildReprintLabelData).
export async function GET(request: NextRequest) {
  const actor = await getActor();
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
  if (!(await volunteerMayAct(actor, profileId, isGuest))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const record = await getCheckIn(event.series_id, event.occurrence_date, profileId);
  if (!record) return NextResponse.json({ error: "No check-in found to reprint" }, { status: 404 });

  const result = await buildReprintLabelData(record, event.title);
  return NextResponse.json(result);
}
