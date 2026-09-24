import { NextResponse } from "next/server";
import { requireSignedIn } from "@/lib/rbac";
import { TrainingError, syncCourseStatus } from "@/lib/training";

// Deferred Subsplash write for the lesson's course. The watch/quiz routes
// skip it so they return quickly; the client calls this afterwards. A failure
// is recorded on the status row (shown in the admin roster) and retried on
// the next call or from the admin "Retry Subsplash sync" button.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const actor = await requireSignedIn();
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json(await syncCourseStatus(actor, params.id));
  } catch (err) {
    if (err instanceof TrainingError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
