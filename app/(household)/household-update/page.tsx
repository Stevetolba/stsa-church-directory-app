import Link from "next/link";
import { requireHouseholdPage } from "@/lib/householdPageGuard";
import { loadPortal } from "@/lib/householdPortal";
import { RemoveNewMember } from "@/components/household/RemoveNewMember";
import { cardCls, primaryBtn, secondaryBtn } from "@/components/household/ui";

export default async function HouseholdOverviewPage({ searchParams }: { searchParams: { submitted?: string } }) {
  const session = await requireHouseholdPage("household-overview");
  const view = await loadPortal(session.householdId);

  if (!view) {
    return <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">We couldn&apos;t find your household. Please contact the church office.</p>;
  }

  const { household, members, newMembers, address, request, changes } = view;
  const pending = request?.status === "pending";
  const addressLine = [address.street, [address.city, address.state].filter(Boolean).join(", "), address.postal_code].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-brand-navy">{household.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Check each person and your address. Tap anything that needs fixing. Nothing changes in the church directory until the church office reviews it.
        </p>
      </div>

      {searchParams.submitted && (
        <p className="rounded-lg bg-brand-cream px-4 py-3 text-sm text-brand-navy">
          Thank you! Your update was sent to the church office. You can keep editing and send it again until it&apos;s reviewed.
        </p>
      )}
      {pending && !searchParams.submitted && (
        <p className="rounded-lg bg-brand-cream px-4 py-3 text-sm text-brand-navy">
          Your last update is waiting for review. If you change anything below, send it again from the review page.
        </p>
      )}

      <section className="space-y-3" aria-label="Family members">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Family</h2>
        {members.map((m) => (
          <Link key={m.id} href={`/household-update/member/${m.id}`} className={`${cardCls} flex items-center justify-between hover:bg-brand-cream`}>
            <div>
              <div className="font-semibold text-brand-navy">{m.first_name} {m.last_name}</div>
              <div className="text-sm text-muted-foreground">
                {m.roleLabel}
                {m.isChild && m.gradeLabel ? ` · ${m.gradeLabel}` : ""}
                {m.date_of_birth ? ` · Born ${m.date_of_birth}` : ""}
              </div>
            </div>
            {m.hasPendingChanges && <span className="rounded-full bg-brand-cream px-2 py-1 text-xs font-medium text-brand-navy">Edited</span>}
          </Link>
        ))}

        {newMembers.map((n) => (
          <div key={n.key} className={`${cardCls} flex items-center justify-between`}>
            <Link href={`/household-update/member/new?key=${encodeURIComponent(n.key)}`} className="flex-1">
              <div className="font-semibold text-brand-navy">{n.first_name} {n.last_name}</div>
              <div className="text-sm text-muted-foreground">
                New {n.role}{n.gradeLabel ? ` · ${n.gradeLabel}` : ""}{n.date_of_birth ? ` · Born ${n.date_of_birth}` : ""}
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-brand-cream px-2 py-1 text-xs font-medium text-brand-navy">To be added</span>
              <RemoveNewMember memberKey={n.key} />
            </div>
          </div>
        ))}

        <Link href="/household-update/member/new" className={secondaryBtn}>+ Add a family member</Link>
      </section>

      <section className="space-y-3" aria-label="Address">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Address</h2>
        <Link href="/household-update/address" className={`${cardCls} flex items-center justify-between hover:bg-brand-cream`}>
          <div className="text-brand-navy">{addressLine || "No address on file — tap to add"}</div>
          {address.hasPendingChanges && <span className="rounded-full bg-brand-cream px-2 py-1 text-xs font-medium text-brand-navy">Edited</span>}
        </Link>
      </section>

      <div className="border-t border-border pt-4">
        <Link href="/household-update/review" className={primaryBtn}>
          {changes.length > 0 ? `Review & send (${changes.length} change${changes.length === 1 ? "" : "s"})` : "Review & send"}
        </Link>
      </div>
    </div>
  );
}
