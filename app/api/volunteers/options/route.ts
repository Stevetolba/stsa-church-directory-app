import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireVolunteerRosterAccess } from "@/lib/rbac";
import { getRosterScope } from "@/lib/rosterScope";
import { getVolunteerFieldOptions } from "@/lib/subsplash";

// Team / Role choices from Subsplash — used by the roster filters and the
// editors. `manageableTeams` is the subset the caller may assign: null means
// every team (admin), [] means none (read-only).
export async function GET() {
  const forbidden = await requireVolunteerRosterAccess();
  if (forbidden) return forbidden;
  const session = await auth();
  const scope = session?.user ? await getRosterScope(session.user) : { canManage: false, teams: [] };
  const options = await getVolunteerFieldOptions();
  return NextResponse.json({ ...options, manageableTeams: scope.canManage ? scope.teams : [] });
}
