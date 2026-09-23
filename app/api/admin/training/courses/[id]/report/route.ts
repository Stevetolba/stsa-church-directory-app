import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { getProgressReport } from "@/lib/training";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const report = await getProgressReport(params.id);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(report);
}
