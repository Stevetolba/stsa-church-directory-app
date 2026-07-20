import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { revokeDevice } from "@/lib/deviceAuth";

// DELETE /api/devices/[id] — revoke a device (admin-only, ADR-0015 Phase 3).
// Revoking doesn't delete the row — it's kept for the admin devices list's
// history — it just makes verifyDeviceToken() fail closed for that device's
// token from now on.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  await revokeDevice(params.id);
  return NextResponse.json({ ok: true });
}
