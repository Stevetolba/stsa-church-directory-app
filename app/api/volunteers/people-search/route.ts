import { NextResponse, type NextRequest } from "next/server";
import { requireRosterManager } from "@/lib/rbac";
import { searchProfiles } from "@/lib/subsplash";

export interface PeopleSearchHit {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  campuses: string[];
  teams: string[];
  ministry_roles: string[];
  phone_number?: string;
  status: string;
}

// Narrow people search for the "Add volunteer" picker. A Team Lead can't use
// the full directory API (/api/profiles), so this returns only what's needed
// to pick the right person — name, email, campus and current teams — and
// never DOB, address, household or notes. Roles are included so adding
// someone who is already a volunteer elsewhere doesn't overwrite theirs.
export async function GET(request: NextRequest) {
  const scope = await requireRosterManager();
  if (scope instanceof NextResponse) return scope;

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ people: [] });

  const result = await searchProfiles({ search: q, page: 1, pageSize: 10 });
  // A Team Lead never sees children in this picker (their Children page is
  // the scoped place for that); admins keep the full set.
  const visible = scope.teams === null ? result.profiles : result.profiles.filter((p) => p.household_role !== "child");
  const people: PeopleSearchHit[] = visible.map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email,
    campuses: p.campuses ?? (p.campus ? [p.campus] : []),
    teams: p.teams ?? [],
    ministry_roles: p.ministry_roles ?? [],
    phone_number: p.phone_number,
    status: p.status,
  }));
  return NextResponse.json({ people });
}
