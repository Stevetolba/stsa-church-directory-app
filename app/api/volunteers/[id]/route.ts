import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRosterManager } from "@/lib/rbac";
import { CustomFieldUpdateError, getProfile, updateProfile } from "@/lib/subsplash";
import { applyLeadEdit, applyLeadRemoval } from "@/lib/volunteerAccess";

const volunteerSchema = z.object({
  teams: z.array(z.string().trim().min(1).max(100)).max(50),
  ministry_roles: z.array(z.string().trim().min(1).max(100)).max(50),
});

function failure(error: unknown) {
  if (error instanceof CustomFieldUpdateError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  const message = error instanceof Error ? error.message : "Failed to update volunteer";
  return NextResponse.json({ error: message }, { status: 400 });
}

const FORBIDDEN_TEAM = "You can only manage volunteers on your own team.";

// Add or edit a volunteer. Admins set any Team/Role. A Team Lead may only
// put someone on (or keep them on) their own team(s): the volunteer's other
// teams are preserved as they are, and the response returns the final lists.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const scope = await requireRosterManager();
  if (scope instanceof NextResponse) return scope;

  const parsed = volunteerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  let { teams } = parsed.data;
  const { ministry_roles } = parsed.data;

  if (scope.teams !== null) {
    // Fresh read so a lead can't act on stale team membership.
    const current = await getProfile(params.id);
    if (!current) return NextResponse.json({ error: "Volunteer not found" }, { status: 404 });
    const result = applyLeadEdit(current.teams ?? [], scope.teams, teams);
    if (!result.ok) {
      return result.reason === "no-team-selected"
        ? NextResponse.json({ error: "Select at least one team, or remove the volunteer." }, { status: 400 })
        : NextResponse.json({ error: FORBIDDEN_TEAM }, { status: 403 });
    }
    teams = result.teams;
  } else if (teams.length === 0 && ministry_roles.length === 0) {
    return NextResponse.json(
      { error: "Select at least one Team or Role, or remove the volunteer instead." },
      { status: 400 }
    );
  }

  try {
    await updateProfile(params.id, { teams, ministry_roles });
    return NextResponse.json({ ok: true, teams, ministry_roles });
  } catch (error) {
    return failure(error);
  }
}

// Remove from the roster. Admins clear both Team and Role. A Team Lead only
// removes the volunteer from their own team(s): other teams (and the Role)
// stay unless that was the volunteer's only team. The person's profile itself
// is untouched either way.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const scope = await requireRosterManager();
  if (scope instanceof NextResponse) return scope;

  try {
    if (scope.teams === null) {
      await updateProfile(params.id, { teams: [], ministry_roles: [] });
      return NextResponse.json({ ok: true, teams: [], ministry_roles: null });
    }

    const current = await getProfile(params.id);
    if (!current) return NextResponse.json({ error: "Volunteer not found" }, { status: 404 });
    const result = applyLeadRemoval(current.teams ?? [], scope.teams);
    if (!result.ok) return NextResponse.json({ error: FORBIDDEN_TEAM }, { status: 403 });

    if (result.clearRoles) {
      await updateProfile(params.id, { teams: [], ministry_roles: [] });
      return NextResponse.json({ ok: true, teams: [], ministry_roles: [] });
    }
    await updateProfile(params.id, { teams: result.teams });
    return NextResponse.json({ ok: true, teams: result.teams, ministry_roles: current.ministry_roles ?? [] });
  } catch (error) {
    return failure(error);
  }
}
