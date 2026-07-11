import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { updateHousehold } from "@/lib/subsplash";
import { updateHouseholdSchema } from "@/lib/validation/household";

// Same enforcement pattern as /api/profiles/[id] — ADR-0005.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const body = await request.json();
  const parsed = updateHouseholdSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await updateHousehold(params.id, parsed.data);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update household";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
