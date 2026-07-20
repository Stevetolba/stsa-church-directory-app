"use client";

import type { AppEvent } from "@/types/event";
import { groupEventsByDate } from "@/lib/eventAgenda";
import { EventCard } from "@/components/EventCard";

// Date-grouped agenda of events (mirrors BirthdayAgenda). Events with an open
// check-in window are pinned separately by the page and excluded here.
export function EventAgenda({
  events,
  canStartKiosk = false,
  now = new Date(),
}: {
  events: AppEvent[];
  canStartKiosk?: boolean;
  now?: Date;
}) {
  const groups = groupEventsByDate(events, now);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.dateKey}>
          <div className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
            {group.label}
          </div>
          <div className="flex flex-col gap-2.5">
            {group.events.map((event) => (
              <EventCard key={event.id} event={event} canStartKiosk={canStartKiosk} now={now} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
