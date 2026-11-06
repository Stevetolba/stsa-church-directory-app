import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHouseholdPage } from "@/lib/householdPageGuard";
import { loadPortal } from "@/lib/householdPortal";
import { MemberForm } from "@/components/household/MemberForm";

export default async function NewMemberPage({ searchParams }: { searchParams: { key?: string } }) {
  const session = await requireHouseholdPage("household-new-member");
  const view = await loadPortal(session.householdId);
  if (!view) notFound();

  const existing = searchParams.key ? view.newMembers.find((n) => n.key === searchParams.key) : undefined;
  if (searchParams.key && !existing) notFound();

  return (
    <div className="space-y-4">
      <Link href="/household-update" className="text-sm text-muted-foreground underline">← Back to household</Link>
      <h1 className="font-heading text-2xl font-semibold text-brand-navy">{existing ? "Edit new family member" : "Add a family member"}</h1>
      <p className="text-sm text-muted-foreground">The church office will check this before adding the person to the directory.</p>
      <MemberForm
        mode="new"
        newKey={existing?.key ?? null}
        isChild={(existing?.role ?? "child") === "child"}
        initial={{
          first_name: existing?.first_name ?? "",
          last_name: existing?.last_name ?? view.household.name.replace(/\s+family$/i, ""),
          date_of_birth: existing?.date_of_birth ?? "",
          gradeValue: existing?.gradeValue ?? null,
          role: existing?.role ?? "child",
          phone_number: existing?.phone_number ?? "",
          gender: existing?.gender ?? "",
          email: existing?.email ?? "",
          home_street: existing?.home_street ?? "",
          home_city: existing?.home_city ?? "",
          home_state: existing?.home_state ?? "",
          home_postal_code: existing?.home_postal_code ?? "",
          allergy_notes: existing?.allergy_notes ?? "",
          care_notes: existing?.care_notes ?? "",
        }}
      />
    </div>
  );
}
