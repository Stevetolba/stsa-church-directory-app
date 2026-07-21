import { NextResponse, type NextRequest } from "next/server";
import { getAttendanceActorFromRequest } from "@/lib/deviceAuth";
import { searchChildren, searchProfiles } from "@/lib/subsplash";
import { getEvent } from "@/lib/events";
import { defaultSessionForProfile } from "@/lib/sessionMapping";
import type { Campus, Profile } from "@/types/profile";

const KIOSK_PAGE_SIZE = 2000;

// True names-only projection for a device actor (ADR-0015): everything a
// stolen, unattended device could otherwise browse — email, address,
// marital status, custom fields, membership status, phone, date of birth,
// allergy/care notes — is stripped before the response leaves the server.
// Data that the check-in flow still needs from these fields is resolved
// server-side elsewhere, per-request, instead of being bulk-exposed here:
// date of birth feeds session auto-selection (see suggestedSessions below);
// phone/allergy/care notes are returned only in POST /api/kiosk/attendance's
// response for the one child just checked in (for the printed label), never
// as part of a searchable roster.
function projectForDevice(p: Profile): Profile {
  return {
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    email: "", // required by the Profile type; intentionally never populated here
    household_id: p.household_id,
    household_name: p.household_name,
    household_role: p.household_role,
    academic_grade: p.academic_grade,
    academic_grade_value: p.academic_grade_value,
    photo_url: p.photo_url,
    status: p.status,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

// ADR-0015 (Phase 3): the check-in roster search behind /kiosk, reachable by
// either a signed-in user or a device cookie. Staff/admin search the full
// directory (parity with the signed-in check-in page's usePeople); volunteers
// and devices are scoped to child-bearing households (ADR-0011) via the same
// searchChildren() the /api/children route uses, so a device can never coax
// an unrelated adult out of it regardless of query params.
export async function GET(request: NextRequest) {
  const actor = await getAttendanceActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const campus = searchParams.getAll("campus") as Campus[];
  const gradeFromRaw = searchParams.get("gradeFrom");
  const gradeToRaw = searchParams.get("gradeTo");
  const gradeFrom = gradeFromRaw ? Number(gradeFromRaw) : undefined;
  const gradeTo = gradeToRaw ? Number(gradeToRaw) : undefined;
  const eventId = searchParams.get("eventId") ?? undefined;

  const isFullDirectory = actor.type === "user" && (actor.role === "admin" || actor.role === "staff");
  const result = isFullDirectory
    ? await searchProfiles({
        search,
        campus,
        gradeFrom,
        gradeTo,
        pageSize: KIOSK_PAGE_SIZE,
        expandHouseholds: true,
      })
    : await searchChildren({
        search,
        campus,
        gradeFrom,
        gradeTo,
        memberType: "All",
        pageSize: KIOSK_PAGE_SIZE,
        expandHouseholds: true,
      });

  // Computed from the real (unprojected) profiles — including date of
  // birth — before a device actor's copy gets stripped below, so a device
  // never has to receive DOB itself to get the same session pre-selection
  // a signed-in operator sees.
  let suggestedSessions: Record<string, string> | undefined;
  if (eventId) {
    const event = await getEvent(eventId);
    if (event) {
      suggestedSessions = {};
      for (const p of result.profiles) {
        const suggestion = defaultSessionForProfile(event.sessions, p)?.id;
        if (suggestion) suggestedSessions[p.id] = suggestion;
      }
    }
  }

  const profiles = actor.type === "device" ? result.profiles.map(projectForDevice) : result.profiles;
  return NextResponse.json({ ...result, profiles, suggestedSessions });
}
