import { NextResponse, type NextRequest } from "next/server";
import { getAttendanceActorFromRequest } from "@/lib/deviceAuth";
import { searchChildren, searchProfiles } from "@/lib/subsplash";
import type { Campus, Profile } from "@/types/profile";

const KIOSK_PAGE_SIZE = 2000;

// Fields a device actor may see, everything else (email, address, marital
// status, custom fields, membership status...) is stripped before the
// response leaves the server. date_of_birth is kept but never rendered on
// the kiosk screen — it only feeds age-based session auto-selection
// (lib/sessionMapping.ts) — and phone_number/allergy_notes/care_notes are
// kept because they print on the child/pickup labels (components/labels).
// An unattended, possibly-stolen device still can't read the directory.
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
    date_of_birth: p.date_of_birth,
    allergy_notes: p.allergy_notes,
    care_notes: p.care_notes,
    photo_url: p.photo_url,
    phone_number: p.phone_number,
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

  const profiles = actor.type === "device" ? result.profiles.map(projectForDevice) : result.profiles;
  return NextResponse.json({ ...result, profiles });
}
