import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { recordAccessEvent } from "@/lib/accessLog";
import { getRequest, listChanges, newMembersMissingCampus, reviewRequest } from "@/lib/householdUpdates";
import { CAMPUSES } from "@/lib/householdUpdateLogic";
import type { Campus } from "@/types/profile";
import { notifyHouseholdOfOutcome } from "@/lib/householdUpdateNotify";

const schema = z.object({
  acceptedIds: z.array(z.string().uuid()),
  // Keyed by the new member's subject id.
  newMemberCampuses: z.record(z.string(), z.array(z.enum(CAMPUSES as [Campus, ...Campus[]])).min(1)).optional(),
});

// Admin accepts the ticked changes; everything else is rejected. Accepted
// changes are written to Subsplash here and nowhere else (ADR-0005: the admin
// check is server-side).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const session = await auth();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const { acceptedIds, newMemberCampuses } = parsed.data;
    const missing = newMembersMissingCampus(await listChanges(params.id), acceptedIds, newMemberCampuses);
    if (missing.length > 0) {
      return NextResponse.json({ error: `Choose a campus for ${missing.join(", ")}.` }, { status: 400 });
    }
    const status = await reviewRequest(
      params.id,
      acceptedIds,
      session?.user?.email ?? "unknown",
      undefined,
      newMemberCampuses
    );
    await recordAccessEvent({
      email: session?.user?.email ?? "unknown",
      name: session?.user?.name ?? null,
      role: session?.user?.role ?? "admin",
      eventType: "household_update_apply",
      resource: `household-update:${params.id}:${status}`,
    });
    if (status !== "pending") {
      const r = await getRequest(params.id);
      if (r) await notifyHouseholdOfOutcome(r);
    }
    return NextResponse.json({ status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not apply changes" }, { status: 409 });
  }
}
