import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHouseholdPage } from "@/lib/householdPageGuard";
import { loadPortal } from "@/lib/householdPortal";
import { FIELD_LABELS, displayValue } from "@/lib/householdUpdateLogic";
import { SubmitUpdate } from "@/components/household/SubmitUpdate";
import { getHouseholdAutoApply } from "@/lib/appSettings";
import { cardCls } from "@/components/household/ui";

export default async function ReviewPage() {
  const session = await requireHouseholdPage("household-review");
  const view = await loadPortal(session.householdId);
  if (!view) notFound();
  const { request } = view;
  const instant = await getHouseholdAutoApply();
  // Rows already written to Subsplash are history, not something still to send.
  const changes = view.changes.filter((c) => !c.appliedAt);

  // Group by person / address / new member, in the order they were saved.
  const groups = new Map<string, { label: string; kind: string; items: typeof changes }>();
  for (const c of changes) {
    const key = `${c.subjectType}:${c.subjectId}`;
    if (!groups.has(key)) groups.set(key, { label: c.subjectLabel ?? "", kind: c.subjectType, items: [] });
    groups.get(key)!.items.push(c);
  }

  return (
    <div className="space-y-5">
      <Link href="/household-update" className="text-sm text-muted-foreground underline">← Back to household</Link>
      <h1 className="font-heading text-2xl font-semibold text-brand-navy">Review your changes</h1>

      {changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven&apos;t changed anything yet. Go back and tap a person or the address to edit it.</p>
      ) : (
        <div className="space-y-3">
          {Array.from(groups.values()).map((g) => (
            <div key={`${g.kind}:${g.label}`} className={cardCls}>
              <div className="mb-2 font-semibold text-brand-navy">
                {g.kind === "new_member" ? `Add: ${g.label}` : g.label}
              </div>
              <ul className="space-y-1 text-sm">
                {g.items.map((c) => (
                  <li key={c.id} className="flex flex-wrap gap-x-2">
                    <span className="text-muted-foreground">{FIELD_LABELS[c.field]}:</span>
                    {c.oldValue != null && <span className="whitespace-pre-wrap text-muted-foreground line-through">{displayValue(c.field, c.oldValue)}</span>}
                    {c.oldValue != null && <span aria-hidden>→</span>}
                    <span className="whitespace-pre-wrap font-medium text-brand-navy">{displayValue(c.field, c.newValue)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <SubmitUpdate initialNote={request?.note ?? ""} alreadySubmitted={request?.status === "pending"} hasChanges={changes.length > 0} instant={instant} />
    </div>
  );
}
