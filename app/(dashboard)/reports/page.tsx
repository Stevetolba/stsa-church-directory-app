import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { listSeries } from "@/lib/events";
import { EmptyState } from "@/components/EmptyState";

// The 3 series this page reports on, pinned by their real Subsplash
// repeating-event id rather than matched by title. Confirmed directly
// against the org (2026-08-22): Subsplash has *two* distinct repeating-event
// series both titled "Sunday School [Arlington]" (an old one, retired
// 2025-10, and its same-named replacement) — same for "[Leesburg]". Matching
// by title landed a real import under the wrong (stale, dead) series with no
// error (see ADR-0021 / lib/attendanceImport.ts's findSeriesByTitle). Keying
// this page directly by id sidesteps that ambiguity entirely — no title
// lookup involved. If Subsplash ever retires one of these ids again, its
// card just quietly stops appearing (filtered out below) rather than
// silently pointing at a dead series.
const CURATED_SERIES: { label: string; seriesId: string }[] = [
  { label: "Sunday School [Arlington]", seriesId: "cf945785-424e-4537-9026-97260f911a6e" },
  { label: "Sunday School [Leesburg]", seriesId: "8afcd344-51e4-4cf2-8d77-2dbb67dd0ecc" },
  { label: "LITURGY", seriesId: "b20a0f15-8403-47eb-aee1-dec62bc66fc6" },
];

// ADR-0015 (Phase 4): staff/admin landing page for attendance reports — the
// 3 series the church actually tracks attendance for day to day, so a
// monthly review starts here instead of picking through the full events
// list (which includes many one-off/seasonal check-in-enabled events that
// aren't part of the regular reporting rhythm). requireStaffOrAdmin() guards
// the actual report/absentees API routes; this redirect just keeps a
// volunteer from landing on a page that would only 403 against them.
export default async function ReportsPage() {
  const session = await auth();
  if (session?.user?.role === "volunteer") {
    redirect("/");
  }

  const series = await listSeries();
  const byId = new Map(series.map((s) => [s.seriesId, s]));
  const cards = CURATED_SERIES.map((c) => {
    const match = byId.get(c.seriesId);
    return match ? { label: c.label, representativeEventId: match.representativeEventId } : null;
  }).filter((c): c is { label: string; representativeEventId: string } => c !== null);

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-3xl font-semibold text-brand-navy">Reports</h1>
        <p className="mt-1 text-[14.5px] text-[#5B7185]">
          Attendance by occurrence or over time, and who&apos;s missed recent services or classes.
        </p>
      </div>

      {cards.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} message="No check-in-enabled series yet." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {cards.map((c) => (
            <Link
              key={c.representativeEventId}
              href={`/events/${encodeURIComponent(c.representativeEventId)}/report`}
              className="flex items-center justify-between gap-3 rounded-[14px] border border-[#EAE2D0] bg-white px-5 py-4 shadow-[0_1px_3px_rgba(26,58,92,0.05)] transition-colors hover:border-brand-navy/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <BarChart3 className="h-[18px] w-[18px] shrink-0 text-[#7C8FA0]" />
                <span className="truncate text-[15.5px] font-semibold text-brand-navy">{c.label}</span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#8A94A0]" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
