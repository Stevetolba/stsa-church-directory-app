import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { getRoster, listEnrollmentsForProfile, removeEnrollment } from "@/lib/training";
import { getProfile, getDirectoryRole } from "@/lib/subsplash";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ roster: await getRoster(params.id) });
}

// "Remove from training": ends the enrollment. Subsplash choice fields can't
// be cleared through the API this app uses, so a person left with
// DirectoryRole=Learner and no enrollments is flagged in the response for
// the admin to clear in Subsplash; they see no courses meanwhile.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  await removeEnrollment(profileId, params.id);
  return NextResponse.json({ ok: true, note: await maybeRevokeLearner(profileId) });
}

async function maybeRevokeLearner(profileId: string): Promise<string | undefined> {
  const profile = await getProfile(profileId);
  if (!profile?.email) return undefined;
  if ((await getDirectoryRole(profile.email)) !== "Learner") return undefined;
  // Only revoke when this was their last active enrollment.
  if ((await listEnrollmentsForProfile(profileId)).length > 0) return undefined;
  return "Person still has DirectoryRole=Learner in Subsplash; clear it there or from their profile to remove sign-in access.";
}
