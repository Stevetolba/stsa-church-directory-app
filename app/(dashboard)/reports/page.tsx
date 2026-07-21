import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { campusGroupFor, listSeries, type SeriesSummary } from "@/lib/events";
import { EmptyState } from "@/components/EmptyState";

// ADR-0015 (Phase 4): staff/admin landing page for attendance reports — lists
// every check-in-enabled series so a monthly review starts here instead of
// picking through the events list. requireStaffOrAdmin() guards the actual
// report/absentees API routes; this redirect just keeps a volunteer from
// landing on a page that would only 403 against them.
export default async function ReportsPage() {
  const session = await auth();
  if (session?.user?.role === "volunteer") {
    redirect("/");
  }

  const series = await listSeries();
  const groups = new Map<string, SeriesSummary[]>();
  for (const s of series) {
    const key = campusGroupFor(s.title);
    const group = groups.get(key) ?? [];
    group.push(s);
    groups.set(key, group);
  }
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) =>
    a === "General" ? 1 : b === "General" ? -1 : a.localeCompare(b)
  );

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-3xl font-semibold text-brand-navy">Reports</h1>
        <p className="mt-1 text-[14.5px] text-[#5B7185]">
          Attendance by occurrence or over time, and who&apos;s missed recent services or classes.
        </p>
      </div>

      {series.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} message="No check-in-enabled series yet." />
      ) : (
        <div className="flex flex-col gap-8">
          {sortedGroups.map(([campus, group]) => (
            <div key={campus}>
              <div className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
                {campus}
              </div>
              <div className="flex flex-col gap-2.5">
                {group.map((s) => (
                  <Link
                    key={s.seriesId}
                    href={`/events/${encodeURIComponent(s.representativeEventId)}/report`}
                    className="flex items-center justify-between gap-3 rounded-[14px] border border-[#EAE2D0] bg-white px-5 py-4 shadow-[0_1px_3px_rgba(26,58,92,0.05)] transition-colors hover:border-brand-navy/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <BarChart3 className="h-[18px] w-[18px] shrink-0 text-[#7C8FA0]" />
                      <span className="truncate text-[15.5px] font-semibold text-brand-navy">{s.title}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#8A94A0]" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
