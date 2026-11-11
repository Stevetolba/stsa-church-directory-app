import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRequest, listChanges } from "@/lib/householdUpdates";
import { buildReviewGroups } from "@/lib/householdUpdateReview";
import { findDuplicateCandidates } from "@/lib/householdUpdateLogic";
import { getHousehold, searchProfiles } from "@/lib/subsplash";
import { HouseholdUpdateReview } from "@/components/household/HouseholdUpdateReview";

export default async function HouseholdUpdateDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");

  const request = await getRequest(params.id);
  if (!request || request.status === "draft") notFound();
  const [changes, household] = await Promise.all([listChanges(request.id), getHousehold(request.householdId)]);
  const groups = buildReviewGroups(changes, household);

  // Possible existing people for each proposed new member, so the admin can
  // avoid creating a duplicate profile.
  const duplicates: Record<string, { id: string; name: string; detail: string }[]> = {};
  // Skipped once applied: the roster then contains the profile we just created.
  for (const g of groups.filter((x) => x.type === "new_member" && !x.rows.every((r) => r.applied))) {
    const vals = (f: string) => changes.find((c) => c.subjectId === g.subjectId && c.field === f)?.newValue ?? "";
    const last = vals("last_name");
    const roster = (await searchProfiles({ search: last, pageSize: 200 })).profiles;
    duplicates[g.subjectId] = findDuplicateCandidates(
      { first_name: vals("first_name"), last_name: last, date_of_birth: vals("date_of_birth") || null },
      roster
    ).map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      detail: [p.household_name, p.date_of_birth ? `born ${p.date_of_birth}` : null].filter(Boolean).join(" · "),
    }));
  }

  return (
    <div className="space-y-4 p-4 md:p-8">
      <Link href="/settings/household-updates" className="text-sm text-muted-foreground underline">← All household updates</Link>
      <h1 className="font-heading text-2xl font-semibold text-brand-navy">{request.householdName ?? request.householdId}</h1>
      <p className="text-sm text-muted-foreground">
        Submitted by {request.submittedByEmail}
        {request.submittedAt ? ` on ${request.submittedAt.toLocaleString("en-US", { timeZone: "America/New_York" })}` : ""}.
        Nothing below has been written to Subsplash unless it is marked applied.
      </p>
      {request.note && (
        <blockquote className="rounded-lg border-l-4 border-brand-navy bg-[#F5F7F9] px-4 py-3 text-sm">{request.note}</blockquote>
      )}
      {request.status === "rejected" && request.rejectionReason && (
        <p className="text-sm text-muted-foreground">Rejected: {request.rejectionReason}</p>
      )}
      <HouseholdUpdateReview requestId={request.id} status={request.status} groups={groups} duplicates={duplicates} />
    </div>
  );
}
