"use client";

import Link from "next/link";
import { BarChart3, CalendarCheck, Clock } from "lucide-react";
import type { AppEvent } from "@/types/event";
import type { Role } from "@/types/auth";
import { occurrenceDateInTz, timeLabelInTz } from "@/lib/eventTime";
import { isSundaySchoolSeriesId } from "@/lib/reportAccess";

// One event in the agenda. Attendance is captured in Subsplash Check-In, not
// here (ADR-0021), so this card is informational — it links to the event's
// attendance report rather than offering a check-in action.
export function EventCard({
  event,
  highlighted = false,
  role = "volunteer",
  now = new Date(),
}: {
  event: AppEvent;
  highlighted?: boolean;
  role?: Role;
  now?: Date;
}) {
  const startLabel = timeLabelInTz(new Date(event.start_at), event.timezone);
  const endLabel = event.end_at ? timeLabelInTz(new Date(event.end_at), event.timezone) : null;
  // A report is only worth linking to once the event has actually happened —
  // attendance is imported from Subsplash after the fact, so a future-dated
  // occurrence has nothing to show yet.
  const hasHappened = event.occurrence_date <= occurrenceDateInTz(now.toISOString(), event.timezone);
  // Staff/admin see every event's report; a volunteer (including a Team
  // Lead) only Sunday School's, matching requireReportAccess's server-side
  // gate on the report/absentees/import-status API routes.
  const canViewReports =
    role === "admin" || role === "staff" || (role === "volunteer" && isSundaySchoolSeriesId(event.series_id));

  return (
    <div
      className={`flex flex-col gap-3 rounded-[14px] border bg-white px-5 py-4 shadow-[0_1px_3px_rgba(26,58,92,0.05)] transition-colors sm:flex-row sm:items-center sm:justify-between ${
        highlighted ? "border-[#3F6B45]/40 ring-1 ring-[#3F6B45]/20" : "border-[#EAE2D0]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <CalendarCheck className={`h-[18px] w-[18px] shrink-0 ${highlighted ? "text-[#3F6B45]" : "text-[#7C8FA0]"}`} />
          <span className="truncate text-[15.5px] font-semibold text-brand-navy">{event.title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[26px] text-[13px] text-[#5B7185]">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {startLabel}
            {endLabel ? ` – ${endLabel}` : ""}
          </span>
          {event.sessions.length > 0 && (
            <span className="text-[#8A94A0]">
              {event.sessions.length} session{event.sessions.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {canViewReports && hasHappened && (
        <div className="flex shrink-0 items-center gap-2 pl-[26px] sm:pl-0">
          <Link
            href={`/events/${event.id}/report`}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[#E5DCC8] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Report
          </Link>
        </div>
      )}

    </div>
  );
}
