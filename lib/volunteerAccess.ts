// Pure rules for what a Team Lead may change on the volunteer roster. A Team
// Lead manages the team(s) set on their own profile; any other team a
// volunteer belongs to is left exactly as it is. Admins are unrestricted and
// don't use these helpers.

export interface RosterScope {
  // Can this person add / edit / remove volunteers at all?
  canManage: boolean;
  // The teams they may manage, or null for "every team" (admin).
  teams: string[] | null;
}

const overlaps = (a: string[], b: string[]) => a.some((x) => b.includes(x));

export type LeadEditResult =
  | { ok: true; teams: string[] }
  | { ok: false; reason: "forbidden" | "no-team-selected" };

// A lead sets which of THEIR teams a volunteer is on. `requested` is the
// lead's selection; teams outside the lead's own are rejected, and the
// volunteer's other teams (`current` minus the lead's) are kept untouched.
// Allowed when the volunteer is already on one of the lead's teams (edit) or
// the request adds them to one (add).
export function applyLeadEdit(current: string[], leadTeams: string[], requested: string[]): LeadEditResult {
  if (requested.some((t) => !leadTeams.includes(t))) return { ok: false, reason: "forbidden" };
  if (requested.length === 0) {
    return overlaps(current, leadTeams)
      ? { ok: false, reason: "no-team-selected" }
      : { ok: false, reason: "forbidden" };
  }
  const preserved = current.filter((t) => !leadTeams.includes(t));
  return { ok: true, teams: [...preserved, ...requested] };
}

export type LeadRemovalResult =
  | { ok: true; teams: string[]; clearRoles: boolean }
  | { ok: false; reason: "forbidden" };

// A lead removes a volunteer from THEIR teams only. If the volunteer is on
// other teams they stay on the roster (roles untouched); if that was their
// only team, they leave the roster entirely and their roles are cleared too.
export function applyLeadRemoval(current: string[], leadTeams: string[]): LeadRemovalResult {
  if (!overlaps(current, leadTeams)) return { ok: false, reason: "forbidden" };
  const remaining = current.filter((t) => !leadTeams.includes(t));
  return { ok: true, teams: remaining, clearRoles: remaining.length === 0 };
}

// Can this scope act on a volunteer who is currently on `teams`?
export function canManageVolunteer(scope: RosterScope, teams: string[]): boolean {
  if (!scope.canManage) return false;
  return scope.teams === null || overlaps(teams, scope.teams);
}
