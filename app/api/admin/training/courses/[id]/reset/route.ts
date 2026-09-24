import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { getCourse, resetProgress } from "@/lib/training";

// Admin-only: reset one person's progress in a course so they can repeat it.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  if (!(await getCourse(params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...(await resetProgress(params.id, profileId)) });
}
