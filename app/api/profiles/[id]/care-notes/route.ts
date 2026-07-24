import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getProfile, profileVisibleToVolunteer, updateProfile } from "@/lib/subsplash";
import { updateCareNotesSchema } from "@/lib/validation/profile";

// ADR-0018: unlike PATCH /api/profiles/[id] (admin-only, ADR-0005), this
// lets any authenticated role — admin, staff, and volunteer — update a
// child's care notes, without granting the broader profile-edit
// permissions that route implies. A volunteer must still be scoped to this
// specific child (ADR-0011's profileVisibleToVolunteer) — reachable
// profileIds aren't widened just because the role check loosened.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getProfile(params.id);
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // care_notes is child-only in Subsplash (ADR-0012) — reject outright
  // rather than silently writing a field that doesn't apply to this record.
  if (profile.household_role !== "child") {
    return NextResponse.json({ error: "Care notes only apply to children" }, { status: 400 });
  }

  if (session.user.role === "volunteer" && !(await profileVisibleToVolunteer(profile.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateCareNotesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await updateProfile(params.id, { care_notes: parsed.data.care_notes });
  return NextResponse.json(updated);
}
