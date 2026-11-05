import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { recordAccessEvent } from "@/lib/accessLog";
import { getRequest, markNewMemberAddedManually } from "@/lib/householdUpdates";
import { notifyHouseholdOfOutcome } from "@/lib/householdUpdateNotify";

// For a proposed new family member the admin has added in Subsplash by hand
// (for example because the API credential can't create profiles). Closes out
// that person's rows without writing anything to Subsplash.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const session = await auth();
  const body = (await request.json().catch(() => ({}))) as { subjectId?: unknown };
  if (typeof body.subjectId !== "string" || !body.subjectId) {
    return NextResponse.json({ error: "Missing family member." }, { status: 400 });
  }
  const email = session?.user?.email ?? "unknown";
  try {
    await markNewMemberAddedManually(params.id, body.subjectId, email);
    const r = await getRequest(params.id);
    await recordAccessEvent({
      email,
      name: session?.user?.name ?? null,
      role: session?.user?.role ?? "admin",
      eventType: "household_update_apply",
      resource: `household-update:${params.id}:manual:${body.subjectId}`,
    });
    if (r && r.status !== "pending") await notifyHouseholdOfOutcome(r);
    return NextResponse.json({ status: r?.status ?? "pending" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not update" }, { status: 409 });
  }
}
