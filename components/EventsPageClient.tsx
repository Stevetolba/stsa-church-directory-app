"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { CalendarCheck, CalendarSync } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { EmptyState } from "@/components/EmptyState";
import { EventCard } from "@/components/EventCard";
import { EventAgenda } from "@/components/EventAgenda";
import { useEvents } from "@/hooks/useEvents";
import { occurrenceDateInTz, windowState } from "@/lib/eventTime";
import type { CalendarSyncRun } from "@/lib/calendarSync";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  return res.json();
}

// ADR-0022: admin-only manual sync of public Subsplash events onto the STSA
// Church Public Google Calendar. Shows the last run's result on load (via
// GET) and lets an admin trigger a new one (via POST), with a result
// banner — same button/banner shape as the attendance CSV upload feature
// (components/AttendanceReportClient.tsx's UploadCsvButton/ImportStatusBanner).
function CalendarSyncControl() {
  const { data, mutate } = useSWR<{ run: CalendarSyncRun | null }>("/api/events/sync-calendar", fetcher);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const lastRun = data?.run;

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/events/sync-calendar", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setResult({ kind: "error", message: body?.error ?? `Sync failed (${res.status})` });
        return;
      }
      const run = body.run as CalendarSyncRun;
      if (run.error) {
        setResult({ kind: "error", message: run.error });
      } else {
        setResult({
          kind: "success",
          message: `${run.eventsSeen} event${run.eventsSeen === 1 ? "" : "s"} synced: ${run.eventsCreated} created, ${run.eventsUpdated} updated, ${run.eventsDeleted} removed.`,
        });
      }
      await mutate({ run });
    } catch (err) {
      setResult({ kind: "error", message: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mb-7 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-[10px] border border-[#E5DCC8] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarSync className="h-3.5 w-3.5" />
          {syncing ? "Syncing…" : "Sync to Google Calendar"}
        </button>
        {!result && lastRun && (
          <span className="text-[12.5px] text-[#8A94A0]">
            Last synced {new Date(lastRun.ranAt).toLocaleString()}
            {lastRun.error ? " — last run had an error" : ""}
          </span>
        )}
      </div>
      {result && (
        <div
          className={`rounded-[12px] border px-3.5 py-2.5 text-[12.5px] ${
            result.kind === "error"
              ? "border-[#E9C9C2] bg-[#F6EDEA] text-[#B04A3A]"
              : "border-[#CFE0CF] bg-[#EEF6EE] text-[#3F6B45]"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}

// The events landing page. Events happening right now are pinned at the top in
// a highlighted section; everything else follows as a date-grouped agenda
// (like the birthdays page). Attendance itself is captured in Subsplash and
// imported (ADR-0021), so the cards link to reports, not to check-in.
export function EventsPageClient({
  canViewReports,
  isAdmin,
}: {
  canViewReports: boolean;
  isAdmin: boolean;
}) {
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

      {isAdmin && <CalendarSyncControl />}

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
