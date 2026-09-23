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
  } catch {
    return NextResponse.json({ error: "Could not create course (is the slug already in use?)" }, { status: 409 });
  }
}
