import { NextResponse, type NextRequest } from "next/server";
import { requireVolunteerRosterAccess } from "@/lib/rbac";
import { FULL_ROSTER_PAGE_SIZE, searchProfiles } from "@/lib/subsplash";
import type { Campus } from "@/types/profile";
import type { VolunteerListResponse } from "@/types/volunteer";

// Volunteer roster read — admins and Team Leads. Returns only roster fields
// (see types/volunteer.ts), never the full profile.
export async function GET(request: NextRequest) {
  const forbidden = await requireVolunteerRosterAccess();
  if (forbidden) return forbidden;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const campus = searchParams
    .getAll("campus")
    .filter((c): c is Campus => c === "Arlington" || c === "Leesburg");
  const teams = searchParams.getAll("team");
  const ministryRoles = searchParams.getAll("role");

  const result = await searchProfiles({
    search,
    campus,
    teams,
    ministryRoles,
    volunteersOnly: true,
    sortBy: "last_name",
    page: 1,
    pageSize: FULL_ROSTER_PAGE_SIZE,
  });

  const body: VolunteerListResponse = {
    total: result.total,
    volunteers: result.profiles.map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      phone_number: p.phone_number,
      status: p.status,
      campuses: p.campuses ?? (p.campus ? [p.campus] : []),
      teams: p.teams ?? [],
      ministry_roles: p.ministry_roles ?? [],
    })),
  };
  return NextResponse.json(body);
}
