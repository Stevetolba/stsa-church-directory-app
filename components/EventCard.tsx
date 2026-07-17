"use client";

import Link from "next/link";
import { CalendarCheck, Clock, LogIn, MonitorPlay } from "lucide-react";
import type { AppEvent } from "@/types/event";
import { checkInWindow, occurrenceDateInTz, timeLabelInTz, windowState } from "@/lib/eventTime";

// One event in the agenda. When its check-in window is open it's rendered
// highlighted (accent border) with prominent Check-in / Kiosk actions; other
// events show a muted status chip.
export function EventCard({
  event,
  highlighted = false,
  canStartKiosk = false,
  now = new Date(),
}: {
  event: AppEvent;
  highlighted?: boolean;
  canStartKiosk?: boolean;
  now?: Date;
}) {
  const state = windowState(event, now);
  const { opensAt, closesAt } = checkInWindow(event);
  const startLabel = timeLabelInTz(new Date(event.start_at), event.timezone);
  const endLabel = event.end_at ? timeLabelInTz(new Date(event.end_at), event.timezone) : null;
  // Check-in only ever opens the same day (45 min before start_at at the
  // earliest), so a future-dated event has nothing to do yet — no point
  // showing a button for it days or weeks ahead of time.
  const isToday = event.occurrence_date === occurrenceDateInTz(now.toISOString(), event.timezone);

  const statusChip =
    state === "open"
      ? { text: `Check-in open · closes ${timeLabelInTz(closesAt, event.timezone)}`, cls: "bg-[#E6EEE1] text-[#3F6B45]" }
      : state === "upcoming"
        ? { text: `Opens ${timeLabelInTz(opensAt, event.timezone)}`, cls: "bg-[#EEF2F6] text-[#4C6178]" }
        : { text: "Check-in closed", cls: "bg-[#F1EEE7] text-[#8A94A0]" };

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
          <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${statusChip.cls}`}>
            {statusChip.text}
          </span>
        </div>
      </div>

      {isToday && (
        <div className="flex shrink-0 items-center gap-2 pl-[26px] sm:pl-0">
          <Link
            href={`/events/${event.id}/check-in`}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              state === "open"
                ? "bg-brand-navy text-brand-cream hover:bg-brand-navy/90"
                : "border border-[#E5DCC8] bg-white text-[#5B7185] hover:border-brand-navy/30"
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            Check in
          </Link>
          {canStartKiosk && state === "open" && (
            <Link
              href={`/kiosk?eventId=${encodeURIComponent(event.id)}`}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[#E5DCC8] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30"
            >
              <MonitorPlay className="h-3.5 w-3.5" />
              Kiosk
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
