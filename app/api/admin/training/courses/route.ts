import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { createCourse, listCourses } from "@/lib/training";
import { courseInputSchema } from "@/lib/validation/training";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ courses: await listCourses() });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = courseInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json(await createCourse(parsed.data), { status: 201 });
  } catch (err) {
    console.error("Training: create course failed", err);
    // Postgres 23505 = unique_violation; the in-memory store throws its own message.
    const cause = err as { code?: string; cause?: { code?: string }; message?: string };
    const duplicate =
      cause.code === "23505" || cause.cause?.code === "23505" || cause.message === "Slug already in use";
    if (duplicate) {
      return NextResponse.json({ error: "That slug is already in use — pick a different title." }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Could not create course. Has the training database migration been applied?" },
      { status: 500 }
    );
  }
}
