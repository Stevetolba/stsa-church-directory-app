import { NextResponse, type NextRequest } from "next/server";
import { requireSignedIn } from "@/lib/rbac";
import { TrainingError, submitQuiz } from "@/lib/training";
import { quizSubmitSchema } from "@/lib/validation/training";

// Grading is server-side; the response says which questions were right but
// never reveals the answer key itself.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requireSignedIn();
  if (actor instanceof NextResponse) return actor;
  const parsed = quizSubmitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    return NextResponse.json(await submitQuiz(actor, params.id, parsed.data.answers));
  } catch (err) {
    if (err instanceof TrainingError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
