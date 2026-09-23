import { NextResponse, type NextRequest } from "next/server";
import { requireSignedIn } from "@/lib/rbac";
import { TrainingError, recordWatch } from "@/lib/training";
import { watchSchema } from "@/lib/validation/training";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requireSignedIn();
  if (actor instanceof NextResponse) return actor;
  const parsed = watchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await recordWatch(actor, params.id, parsed.data.pct);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TrainingError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
