import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getHouseholdAutoApply } from "@/lib/appSettings";
import { AutoApplySwitch } from "@/components/household/AutoApplySwitch";
import { AUTO_REVIEWER, listChanges, listRequests, type RequestStatus } from "@/lib/householdUpdates";

const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Draft",
  pending: "Needs review",
  applied: "Applied",
  partially_applied: "Partly applied",
  rejected: "Rejected",
};
const FILTERS: Array<{ value: RequestStatus | "all"; label: string }> = [
  { value: "pending", label: "Needs review" },
  { value: "applied", label: "Applied" },
  { value: "partially_applied", label: "Partly applied" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

// Admin-only. Unless instant apply is on (ADR-0031), nothing reaches Subsplash
// until an admin accepts it from the detail page.
export default async function HouseholdUpdatesPage({ searchParams }: { searchParams: { status?: string } }) {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");

  const filter = (FILTERS.find((f) => f.value === searchParams.status)?.value ?? "pending") as RequestStatus | "all";
  const requests = await listRequests(filter === "all" ? {} : { status: filter });
  const autoApply = await getHouseholdAutoApply();
  const counts = new Map<string, number>();
  for (const r of requests) counts.set(r.id, (await listChanges(r.id)).length);

  return (
    <div className="space-y-4 p-4 md:p-8">
      <h1 className="font-heading text-2xl font-semibold text-brand-navy">Household updates</h1>
      <p className="text-sm text-muted-foreground">
        Families propose changes to their own information. Review each one and choose what to apply to Subsplash.
      </p>
      <AutoApplySwitch initial={autoApply} />
      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/settings/household-updates?status=${f.value}`}
            className={`rounded-full border px-3 py-1 text-sm ${f.value === filter ? "border-brand-navy bg-brand-navy text-brand-cream" : "border-border bg-white text-brand-navy"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-[#F5F7F9] text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Household</th>
                <th className="px-4 py-2">Submitted by</th>
                <th className="px-4 py-2">Changes</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-[#F5F7F9]/30">
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/settings/household-updates/${r.id}`} className="text-brand-navy underline">
                      {r.householdName ?? r.householdId}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.submittedByEmail}</td>
                  <td className="px-4 py-2">{counts.get(r.id)}</td>
                  <td className="px-4 py-2">{r.status === "applied" && r.reviewedByEmail === AUTO_REVIEWER ? "Applied automatically" : STATUS_LABEL[r.status]}</td>
                  <td className="px-4 py-2">{r.submittedAt ? r.submittedAt.toLocaleString("en-US", { timeZone: "America/New_York" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
