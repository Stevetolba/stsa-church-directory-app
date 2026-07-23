import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { deleteDevice } from "@/lib/deviceAuth";

// POST /api/devices/[id]/delete — permanently remove an already-revoked
// device's row (admin-only). Kept as its own route rather than reusing
// DELETE /api/devices/[id] (which only revokes) since the two need very
// different confirmation UX and this one can't be undone.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const deleted = await deleteDevice(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Device must be revoked before it can be deleted" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
