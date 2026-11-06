import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { getHouseholdAutoApply, setHouseholdAutoApply } from "@/lib/appSettings";

// Admin-only switch for ADR-0031: write household edits to Subsplash as soon as
// the household submits, instead of waiting for review.
export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  return NextResponse.json({ enabled: await getHouseholdAutoApply() });
}

export async function PUT(request: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const session = await auth();
  const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false." }, { status: 400 });
  }
  await setHouseholdAutoApply(body.enabled, session?.user?.email ?? "unknown");
  return NextResponse.json({ enabled: body.enabled });
}
