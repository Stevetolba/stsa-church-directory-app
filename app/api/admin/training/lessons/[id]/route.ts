import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { deleteLesson, replaceQuestions, updateLesson } from "@/lib/training";
import { lessonInputSchema, questionsInputSchema } from "@/lib/validation/training";

// PATCH body may carry lesson fields, a full replacement `questions` set, or both.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { questions, ...lessonFields } = body;

  let lesson = null;
  if (Object.keys(lessonFields).length > 0) {
    const parsed = lessonInputSchema.partial().safeParse(lessonFields);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
    }
    lesson = await updateLesson(params.id, parsed.data);
    if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (questions !== undefined) {
    const parsed = questionsInputSchema.safeParse({ questions });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
    }
    await replaceQuestions(params.id, parsed.data.questions);
  }
  return NextResponse.json({ ok: true, lesson });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await deleteLesson(params.id);
  return NextResponse.json({ ok: true });
}
