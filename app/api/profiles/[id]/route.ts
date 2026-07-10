import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { updateProfile } from "@/lib/subsplash";
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
  } catch {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
}
