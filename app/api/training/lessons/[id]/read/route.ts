import { NextResponse, type NextRequest } from "next/server";
import { requireSignedIn } from "@/lib/rbac";
import { TrainingError, markContentRead } from "@/lib/training";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requireSignedIn();
  if (actor instanceof NextResponse) return actor;
  try {
    const { needsSync } = await markContentRead(actor, params.id);
    return NextResponse.json({ ok: true, needsSync });
  } catch (err) {
    if (err instanceof TrainingError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
