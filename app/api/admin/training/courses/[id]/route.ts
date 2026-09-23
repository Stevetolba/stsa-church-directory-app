import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { deleteCourse, getCourse, listLessons, listQuestions, updateCourse } from "@/lib/training";
import { courseInputSchema } from "@/lib/validation/training";

// Admin view includes the answer keys so the quiz editor can show them.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const course = await getCourse(params.id);
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const lessons = await listLessons(course.id);
  const withQuestions = await Promise.all(
    lessons.map(async (l) => ({ ...l, questions: await listQuestions(l.id) }))
  );
  return NextResponse.json({ course, lessons: withQuestions });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = courseInputSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const updated = await updateCourse(params.id, parsed.data);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await deleteCourse(params.id);
  return NextResponse.json({ ok: true });
}
