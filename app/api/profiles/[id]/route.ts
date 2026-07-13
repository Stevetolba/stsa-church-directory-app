import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { CampusUpdateError, updateProfile } from "@/lib/subsplash";
import { editProfileSchema } from "@/lib/validation/profile";

// ADR-0005: the admin check happens here, independent of the UI — a
// staff-role session gets 403 regardless of what the client sent.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const body = await request.json();
  const parsed = editProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await updateProfile(params.id, parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    // A resolvable-but-unmet campus write (e.g. an unknown dropdown choice) is
    // a 422, distinct from any other failure.
    if (error instanceof CampusUpdateError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    // Surface the real failure instead of a blanket "not found" that masks it.
    const message = error instanceof Error ? error.message : "Failed to update profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
