import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { createLesson, getCourse } from "@/lib/training";
import { lessonInputSchema } from "@/lib/validation/training";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!(await getCourse(params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = lessonInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await createLesson(params.id, parsed.data), { status: 201 });
}
