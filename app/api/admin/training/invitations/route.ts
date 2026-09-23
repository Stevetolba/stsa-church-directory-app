import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { TrainingError, inviteToTraining, type InvitePerson } from "@/lib/training";
import { getProfile } from "@/lib/subsplash";
import { getFromAddress } from "@/lib/email";
import { invitationSchema } from "@/lib/validation/training";

// ADR-0023: admin invites people (from the People list) to one or more
// courses. Sets DirectoryRole=Learner on anyone with no other access,
// enrolls them, and optionally emails a link to /training.
export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const session = await auth();
  const parsed = invitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }

  const profiles = await Promise.all(parsed.data.profileIds.map((id) => getProfile(id)));
  const people: InvitePerson[] = profiles
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      id: p.id,
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      directory_access: p.directory_access,
      directory_role: p.directory_role,
    }));

  try {
    const result = await inviteToTraining({
      people,
      courseIds: parsed.data.courseIds,
      invitedBy: session?.user?.email ?? "unknown",
      sendEmail: parsed.data.sendEmail,
      fromName: session?.user?.name ?? "STSA Church",
      replyTo: session?.user?.email ?? getFromAddress(),
      appUrl: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? new URL(request.url).origin,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TrainingError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
