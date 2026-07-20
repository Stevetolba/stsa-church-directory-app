import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getEvent } from "@/lib/events";
import { getProfile, profileVisibleToVolunteer } from "@/lib/subsplash";
import {
  activeMatchCodes,
  checkOut,
  getCheckIn,
  listCheckIns,
  recordCheckIn,
  removeCheckIn,
  summarize,
} from "@/lib/attendance";
import { isWithinCheckInWindow } from "@/lib/eventTime";
import { defaultSessionForProfile, eventAutoSessionType } from "@/lib/sessionMapping";
import { generateMatchCode, isValidMatchCode } from "@/lib/matchCode";
import { checkInSchema, checkOutSchema, removeCheckInSchema } from "@/lib/validation/attendance";
import type { AppEvent } from "@/types/event";
import type { Role } from "@/types/auth";

// ADR-0015. Check-in / check-out / undo, plus reading who's checked in for an
// occurrence. Any authenticated role may check in; volunteers are gated
// per-record to profiles they can already see in the children directory
// (profileVisibleToVolunteer) — a volunteer can check in any child or a child's
// family member, never an unrelated adult. Guests (walk-ins) are always
// allowed. Reports/absentees/email live on separate staff-only routes.

interface Actor {
  email: string;
  role: Role;
}

async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  return { email: session.user.email, role: session.user.role };
}

// A volunteer may act on a profile only if it's a guest or visible to them.
async function volunteerMayAct(actor: Actor, profileId: string, isGuest: boolean): Promise<boolean> {
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
      records.map((r) => volunteerMayAct(actor, r.profileId, r.isGuest))
    );
    records = records.filter((_, i) => visible[i]);
  }
  return NextResponse.json({ event, records, summary: summarize(records) });
}

// POST /api/attendance — check in a person (or a guest) to an event occurrence.
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = checkInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;

  if (body.backfill && actor.role === "volunteer") {
    return NextResponse.json({ error: "Backfill is staff/admin only" }, { status: 403 });
  }

  const event = await getEvent(body.eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Window enforced server-side for live check-in; backfill (staff/admin) skips it.
  if (!body.backfill && !isWithinCheckInWindow(event)) {
    return NextResponse.json({ error: "Check-in is not open for this event" }, { status: 409 });
  }

  const isGuest = !!body.isGuest;
  let profileId: string;
  let displayName: string;
  let isChild = false;
  let sessionId = body.sessionId ?? null;

  if (isGuest) {
    profileId = `guest:${crypto.randomUUID()}`;
    displayName = body.guestName!.trim();
  } else {
    profileId = body.profileId!;
    if (!(await volunteerMayAct(actor, profileId, false))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const profile = await getProfile(profileId);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    displayName = `${profile.first_name} ${profile.last_name}`.trim();
    isChild = profile.household_role === "child";
    // Fall back to the grade-matched / general session if the client didn't
    // pick one.
    if (!sessionId) sessionId = defaultSessionForProfile(event.sessions, profile)?.id ?? null;
  }

  // Drop-off / pickup match code only apply to a child (re-derived above, not
  // trusted from the client) checking into a non-"everyone" session — an
  // "everyone" service (e.g. Liturgy) keeps kids with their parents, so
  // there's no separate pickup to track (same rule the client uses to hide
  // the "Dropped off by" picker). A repeat submission that doesn't carry
  // these (e.g. just changing a session) keeps whatever was already on file
  // rather than blanking it out.
  const existing = isGuest ? null : await getCheckIn(event.series_id, event.occurrence_date, profileId);
  const tracksPickup = isChild && eventAutoSessionType(event.sessions) !== "everyone";
  let droppedOffByProfileId: string | null = existing?.droppedOffByProfileId ?? null;
  let droppedOffByName: string | null = existing?.droppedOffByName ?? null;
  let matchCode: string | null = existing?.matchCode ?? null;
  if (tracksPickup) {
    if (body.dropOffProfileId) {
      if (!(await volunteerMayAct(actor, body.dropOffProfileId, false))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const dropOffProfile = await getProfile(body.dropOffProfileId);
      if (dropOffProfile) {
        droppedOffByProfileId = body.dropOffProfileId;
        droppedOffByName = `${dropOffProfile.first_name} ${dropOffProfile.last_name}`.trim();
      }
    }
    if (body.matchCode && isValidMatchCode(body.matchCode)) {
      matchCode = body.matchCode;
    } else if (!matchCode) {
      matchCode = generateMatchCode(await activeMatchCodes(event.series_id, event.occurrence_date));
    }
  } else {
    droppedOffByProfileId = null;
    droppedOffByName = null;
    matchCode = null;
  }

  const record = await recordCheckIn({
    seriesId: event.series_id,
    eventId: event.id,
    occurrenceDate: event.occurrence_date,
    profileId,
    displayName,
    isChild,
    sessionId,
    sessionName: sessionNameFor(event, sessionId),
    checkedInBy: actor.email,
    droppedOffByProfileId,
    droppedOffByName,
    matchCode,
    method: body.backfill ? "backfill" : "live",
    isGuest,
  });
  return NextResponse.json({ record }, { status: 201 });
}

// PATCH /api/attendance — check a person out (records departure).
export async function PATCH(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = checkOutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { eventId, profileId } = parsed.data;

  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const isGuest = profileId.startsWith("guest:");
  if (!(await volunteerMayAct(actor, profileId, isGuest))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Volunteers can only check out within the window; staff/admin any time
  // (late pickup / cleanup).
  if (actor.role === "volunteer" && !isWithinCheckInWindow(event)) {
    return NextResponse.json({ error: "Check-out is closed for this event" }, { status: 409 });
  }

  const record = await checkOut({
    seriesId: event.series_id,
    occurrenceDate: event.occurrence_date,
    profileId,
    checkedOutBy: actor.email,
  });
  if (!record) return NextResponse.json({ error: "No check-in to check out" }, { status: 404 });
  return NextResponse.json({ record });
}

// DELETE /api/attendance — undo a mis-tap (removes the row entirely).
export async function DELETE(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = removeCheckInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { eventId, profileId } = parsed.data;

  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const isGuest = profileId.startsWith("guest:");
  if (!(await volunteerMayAct(actor, profileId, isGuest))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await removeCheckIn({ seriesId: event.series_id, occurrenceDate: event.occurrence_date, profileId });
  return NextResponse.json({ ok: true });
}

function sessionNameFor(event: AppEvent, sessionId: string | null): string | null {
  if (!sessionId) return null;
  return event.sessions.find((s) => s.id === sessionId)?.name ?? null;
}
