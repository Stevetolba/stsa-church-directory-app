import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { resyncCourse } from "@/lib/training";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await resyncCourse(params.id));
}
