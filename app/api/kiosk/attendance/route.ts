import { NextResponse, type NextRequest } from "next/server";
import { getAttendanceActorFromRequest, type AttendanceActor } from "@/lib/deviceAuth";
import { getEvent } from "@/lib/events";
import { getProfile, profileVisibleToVolunteer } from "@/lib/subsplash";
import {
  activeMatchCodes,
  checkOut,
  getCheckIn,
  listCheckIns,
  recordCheckIn,
  summarize,
} from "@/lib/attendance";
import { isWithinCheckInWindow } from "@/lib/eventTime";
import { defaultSessionForProfile, eventAutoSessionType, sessionNameFor } from "@/lib/sessionMapping";
import { generateMatchCode, isValidMatchCode } from "@/lib/matchCode";
import { checkInSchema, checkOutSchema } from "@/lib/validation/attendance";

// ADR-0015 (Phase 3): check-in / check-out for the kiosk surface, reachable by
// a device cookie as well as a signed-in session (getAttendanceActorFromRequest).
// Deliberately narrower than /api/attendance:
//  - no DELETE (undo) — mis-taps are fixed from the regular check-in page,
//    never on an unattended kiosk
//  - no backfill — "backfill" must never appear on the kiosk/device surface,
//    so this route doesn't accept the field at all (unlike /api/attendance,
//    which lets staff/admin opt into it) and always enforces the check-in
//    window, even for a signed-in staff/admin operator
// A device actor is treated the same as a volunteer for per-record
// visibility: scoped to child-bearing-household profiles (ADR-0011), since no
// person is accountable for an unattended kiosk session. checked_in_by /
// checked_out_by records "device:<id>" for a device actor so attendance rows
// stay attributable to a specific kiosk.

function actorLabel(actor: AttendanceActor): string {
  return actor.type === "user" ? actor.email : `device:${actor.id}`;
}

function actorIsStaffOrAdmin(actor: AttendanceActor): boolean {
  return actor.type === "user" && (actor.role === "admin" || actor.role === "staff");
}

async function mayAct(actor: AttendanceActor, profileId: string, isGuest: boolean): Promise<boolean> {
  if (actorIsStaffOrAdmin(actor)) return true;
  if (isGuest) return true;
  return profileVisibleToVolunteer(profileId);
}

// GET /api/kiosk/attendance?eventId=... — who's checked in for this occurrence.
export async function GET(request: NextRequest) {
  const actor = await getAttendanceActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let records = await listCheckIns(event.series_id, event.occurrence_date);
  if (!actorIsStaffOrAdmin(actor)) {
    const visible = await Promise.all(records.map((r) => mayAct(actor, r.profileId, r.isGuest)));
    records = records.filter((_, i) => visible[i]);
  }
  return NextResponse.json({ event, records, summary: summarize(records) });
}

// POST /api/kiosk/attendance — check in a person (or a guest) to an event occurrence.
export async function POST(request: NextRequest) {
  const actor = await getAttendanceActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = checkInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;

  const event = await getEvent(body.eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // No backfill on the kiosk surface — the window is always enforced here,
  // regardless of who's operating the screen.
  if (!isWithinCheckInWindow(event)) {
    return NextResponse.json({ error: "Check-in is not open for this event" }, { status: 409 });
  }

  const isGuest = !!body.isGuest;
  let profileId: string;
  let displayName: string;
  let isChild = false;
  let sessionId = body.sessionId ?? null;
  // Resolved here (the profile is already fetched for isChild/session
  // defaulting) and returned only in this response, for the printed label —
  // never bulk-exposed via the roster search (ADR-0015).
  let childAllergyNotes: string | null = null;
  let childCareNotes: string | null = null;

  if (isGuest) {
    profileId = `guest:${crypto.randomUUID()}`;
    displayName = body.guestName!.trim();
  } else {
    profileId = body.profileId!;
    if (!(await mayAct(actor, profileId, false))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const profile = await getProfile(profileId);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    displayName = `${profile.first_name} ${profile.last_name}`.trim();
    isChild = profile.household_role === "child";
    if (!sessionId) sessionId = defaultSessionForProfile(event.sessions, profile)?.id ?? null;
    childAllergyNotes = profile.allergy_notes ?? null;
    childCareNotes = profile.care_notes ?? null;
  }

  // Drop-off / pickup match code, same rule as /api/attendance: only for a
  // child checking into a non-"everyone" session.
  const existing = isGuest ? null : await getCheckIn(event.series_id, event.occurrence_date, profileId);
  const tracksPickup = isChild && eventAutoSessionType(event.sessions) !== "everyone";
  let droppedOffByProfileId: string | null = existing?.droppedOffByProfileId ?? null;
  let droppedOffByName: string | null = existing?.droppedOffByName ?? null;
  let matchCode: string | null = existing?.matchCode ?? null;
  let dropOffPhone: string | null = null;
  if (tracksPickup) {
    if (body.dropOffProfileId) {
      if (!(await mayAct(actor, body.dropOffProfileId, false))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const dropOffProfile = await getProfile(body.dropOffProfileId);
      if (dropOffProfile) {
        droppedOffByProfileId = body.dropOffProfileId;
        droppedOffByName = `${dropOffProfile.first_name} ${dropOffProfile.last_name}`.trim();
        dropOffPhone = dropOffProfile.phone_number ?? null;
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
    checkedInBy: actorLabel(actor),
    droppedOffByProfileId,
    droppedOffByName,
    matchCode,
    method: "kiosk",
    isGuest,
  });
  const label = tracksPickup
    ? { allergyNotes: childAllergyNotes, careNotes: childCareNotes, dropOffPhone }
    : undefined;
  return NextResponse.json({ record, label }, { status: 201 });
}

// PATCH /api/kiosk/attendance — check a person out (records departure).
export async function PATCH(request: NextRequest) {
  const actor = await getAttendanceActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = checkOutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { eventId, profileId } = parsed.data;

  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const isGuest = profileId.startsWith("guest:");
  if (!(await mayAct(actor, profileId, isGuest))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Staff/admin (signed in on a kiosk) can check out any time, e.g. late
  // pickup / cleanup; a device or volunteer actor is window-bound.
  if (!actorIsStaffOrAdmin(actor) && !isWithinCheckInWindow(event)) {
    return NextResponse.json({ error: "Check-out is closed for this event" }, { status: 409 });
  }

  const record = await checkOut({
    seriesId: event.series_id,
    occurrenceDate: event.occurrence_date,
    profileId,
    checkedOutBy: actorLabel(actor),
  });
  if (!record) return NextResponse.json({ error: "No check-in to check out" }, { status: 404 });
  return NextResponse.json({ record });
}
