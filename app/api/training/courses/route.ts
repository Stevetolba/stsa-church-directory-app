import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/rbac";
import { listCoursesForViewer } from "@/lib/training";

// ADR-0023: every signed-in role (including learner) may list the courses
// they can access; scoping by role/enrollment happens in listCoursesForViewer.
export async function GET() {
  const actor = await requireSignedIn();
  if (actor instanceof NextResponse) return actor;
  return NextResponse.json({ courses: await listCoursesForViewer(actor) });
}
