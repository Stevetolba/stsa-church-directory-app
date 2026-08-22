"use client";

import { useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { EmptyState } from "@/components/EmptyState";
import { EventCard } from "@/components/EventCard";
import { EventAgenda } from "@/components/EventAgenda";
import { useEvents } from "@/hooks/useEvents";
import { occurrenceDateInTz, windowState } from "@/lib/eventTime";

// The events landing page. Events happening right now are pinned at the top in
// a highlighted section; everything else follows as a date-grouped agenda
// (like the birthdays page). Attendance itself is captured in Subsplash and
// imported (ADR-0021), so the cards link to reports, not to check-in.
export function EventsPageClient({ canViewReports }: { canViewReports: boolean }) {
  const [search, setSearch] = useState("");
  // Fetch from today onward — this surface is about now and upcoming.
  const today = occurrenceDateInTz(new Date().toISOString(), "America/New_York");
  const { events, isLoading } = useEvents({ from: today, search: search || undefined });

  const now = new Date();
  const { openNow, upcoming } = useMemo(() => {
    const open: typeof events = [];
    const rest: typeof events = [];
    for (const e of events) {
      if (windowState(e, now) === "open") open.push(e);
      else rest.push(e);
    }
    open.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return { openNow: open, upcoming: rest };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-heading text-3xl font-semibold text-brand-navy">Events</h1>
        <p className="mt-1 text-[14.5px] text-[#5B7185]">
          Services and classes, and their attendance reports.
        </p>
      </div>

      <div className="mb-7">
        <SearchBar
          defaultValue={search}
          onDebouncedChange={setSearch}
          placeholder="Search events by name"
        />
      </div>

      {isLoading ? (
        <div className="py-[60px] text-center text-[14.5px] text-[#8A94A0]">Loading events…</div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-6 w-6" />}
          message={search ? `No events match "${search}".` : "No upcoming events."}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {openNow.length > 0 && (
            <div>
              <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#3F6B45]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3F6B45] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3F6B45]" />
                </span>
                Happening now
              </div>
              <div className="flex flex-col gap-2.5">
                {openNow.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    highlighted
                    canViewReports={canViewReports}
                    now={now}
                  />
                ))}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <EventAgenda events={upcoming} canViewReports={canViewReports} now={now} />
          )}
        </div>
      )}
    </div>
  );
}
