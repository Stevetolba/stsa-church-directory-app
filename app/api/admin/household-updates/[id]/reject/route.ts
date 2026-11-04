import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { recordAccessEvent } from "@/lib/accessLog";
import { getRequest, rejectRequest } from "@/lib/householdUpdates";
import { notifyHouseholdOfOutcome } from "@/lib/householdUpdateNotify";

const schema = z.object({ reason: z.string().max(500).optional() });

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const session = await auth();
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await rejectRequest(params.id, parsed.data.reason ?? "", session?.user?.email ?? "unknown");
    await recordAccessEvent({
      email: session?.user?.email ?? "unknown",
      name: session?.user?.name ?? null,
      role: session?.user?.role ?? "admin",
      eventType: "household_update_apply",
      resource: `household-update:${params.id}:rejected`,
    });
    const r = await getRequest(params.id);
    if (r) await notifyHouseholdOfOutcome(r);
    return NextResponse.json({ status: "rejected" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not reject" }, { status: 409 });
  }
}
