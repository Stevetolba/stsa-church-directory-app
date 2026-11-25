import { getProfile } from "@/lib/subsplash";
import type { RosterScope } from "@/lib/volunteerAccess";
import type { Role } from "@/types/auth";

// What the signed-in person may do on the volunteer roster. Admins manage
// every team; a Team Lead (volunteer tier + DirectoryRole "Team Lead")
// manages the team(s) currently set on their own profile — read fresh, so a
// change in Subsplash applies immediately instead of at the next sign-in.
// Everyone else (staff, plain volunteers) is read-only.
export async function getRosterScope(user: {
  role: Role;
  canEmailChildren?: boolean;
  profileId?: string;
}): Promise<RosterScope> {
  if (user.role === "admin") return { canManage: true, teams: null };
  if (user.role === "volunteer" && user.canEmailChildren && user.profileId) {
    const teams = (await getProfile(user.profileId))?.teams ?? [];
    return { canManage: teams.length > 0, teams };
  }
  return { canManage: false, teams: [] };
}
