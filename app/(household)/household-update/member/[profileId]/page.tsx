import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHouseholdPage } from "@/lib/householdPageGuard";
import { loadPortal } from "@/lib/householdPortal";
import { MemberForm } from "@/components/household/MemberForm";

export default async function EditMemberPage({ params }: { params: { profileId: string } }) {
  const session = await requireHouseholdPage("household-member");
  const view = await loadPortal(session.householdId);
  // Only people in the signed-in household are reachable.
  const member = view?.members.find((m) => m.id === params.profileId);
  if (!view || !member) notFound();

  return (
    <div className="space-y-4">
      <Link href="/household-update" className="text-sm text-muted-foreground underline">← Back to household</Link>
      <h1 className="font-heading text-2xl font-semibold text-brand-navy">
        {member.first_name} {member.last_name}
      </h1>
      <p className="text-sm text-muted-foreground">{member.isChild ? "Child" : "Adult"} · basic information</p>
      <MemberForm
        mode="existing"
        profileId={member.id}
        isChild={member.isChild}
        hasPendingChanges={member.hasPendingChanges}
        initial={{
          first_name: member.first_name,
          last_name: member.last_name,
          date_of_birth: member.date_of_birth,
          gradeValue: member.gradeValue,
          phone_number: member.phone_number,
          gender: member.gender,
          email: member.email,
          home_street: member.home_street,
          home_city: member.home_city,
          home_state: member.home_state,
          home_postal_code: member.home_postal_code,
          allergy_notes: member.allergy_notes,
          care_notes: member.care_notes,
        }}
      />
    </div>
  );
}
