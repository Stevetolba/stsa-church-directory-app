import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { getFromAddress } from "@/lib/email";
import { TrainingError } from "@/lib/training";
import { sendCourseReminders } from "@/lib/trainingReminders";
import { remindSchema } from "@/lib/validation/training";

// ADR-0026: an admin pushes a reminder now — to everyone who hasn't finished
// the course, or to one person (`profileId`). Sent from the admin's name,
// with replies going to them, same as invitations.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const session = await auth();
  const parsed = remindSchema.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const result = await sendCourseReminders(params.id, {
      mode: "now",
      profileId: parsed.data.profileId,
      fromName: session?.user?.name ?? "STSA Church",
      replyTo: session?.user?.email ?? getFromAddress(),
      appUrl: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? new URL(request.url).origin,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TrainingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Training reminder send failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not send reminders" }, { status: 502 });
  }
}
