import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { recordAccessEvent } from "@/lib/accessLog";
import { applyAcceptedChanges, getRequest } from "@/lib/householdUpdates";
import { notifyHouseholdOfOutcome } from "@/lib/householdUpdateNotify";

// Re-tries accepted changes whose Subsplash write failed earlier. Changes
// already applied are skipped, so this can't write anything twice.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const session = await auth();
  try {
    await applyAcceptedChanges(params.id);
    const r = await getRequest(params.id);
    await recordAccessEvent({
      email: session?.user?.email ?? "unknown",
      name: session?.user?.name ?? null,
      role: session?.user?.role ?? "admin",
      eventType: "household_update_apply",
      resource: `household-update:${params.id}:retry`,
    });
    if (r && r.status !== "pending") await notifyHouseholdOfOutcome(r);
    return NextResponse.json({ status: r?.status ?? "pending" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not retry" }, { status: 409 });
  }
}
