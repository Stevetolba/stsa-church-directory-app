import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/rbac";
import { CustomFieldUpdateError, updateProfile } from "@/lib/subsplash";

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

// Add or edit a volunteer: sets their Team and Role selections (admin only).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const parsed = volunteerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.teams.length === 0 && parsed.data.ministry_roles.length === 0) {
    return NextResponse.json(
      { error: "Select at least one Team or Role, or remove the volunteer instead." },
      { status: 400 }
    );
  }
  try {
    await updateProfile(params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

// Remove from the roster: clears both Team and Role (admin only). The person's
// profile itself is untouched.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  try {
    await updateProfile(params.id, { teams: [], ministry_roles: [] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
