import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getHousehold, getProfile } from "@/lib/subsplash";
import { EditProfileForm } from "@/components/EditProfileForm";

export default async function EditProfilePage({ params }: { params: { id: string } }) {
  const [session, profile] = await Promise.all([auth(), getProfile(params.id)]);

  if (!profile) {
    notFound();
  }

  // Spec: "Redirect non-admins back to profile page." The PATCH route
  // enforces this independently (ADR-0005) — this is UX, not the guard.
  if (session?.user.role !== "admin") {
    redirect(`/people/${profile.id}`);
  }

  // Only used to prefill the address fields when the profile has no address
  // of its own yet — see EditProfileForm's addressDefaults.
  const household = profile.household_id ? await getHousehold(profile.household_id) : null;

  return (
    <div className="mx-auto max-w-[640px]">
      <h1 className="mb-6 font-heading text-3xl font-semibold text-brand-navy">Edit Profile</h1>
      <EditProfileForm profile={profile} household={household} />
    </div>
  );
}
