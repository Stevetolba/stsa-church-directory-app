import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { resyncCourse } from "@/lib/training";

// Re-sends Subsplash status for everyone whose value lags — or for one person
// when ?profileId= is given (the "Update Subsplash" button on a report row).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const profileId = new URL(request.url).searchParams.get("profileId") ?? undefined;
  return NextResponse.json(await resyncCourse(params.id, profileId));
}
