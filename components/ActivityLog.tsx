"use client";

import useSWR from "swr";
import { History } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

interface AccessEventRecord {
  id: string;
  occurredAt: string;
  email: string;
  name: string | null;
  role: "admin" | "staff" | "volunteer";
  eventType: "sign_in" | "sign_in_denied" | "directory_read";
  resource: string | null;
}

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load activity: ${res.status}`);
  return res.json();
}

function formatDayHeading(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Event-local calendar day, not UTC — otherwise a late-evening event would
// group under tomorrow's heading for anyone west of UTC.
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const ROLE_LABEL: Record<AccessEventRecord["role"], string> = {
  admin: "Admin",
  staff: "Staff",
  volunteer: "Volunteer",
};

const RESOURCE_LABEL: Record<string, string> = {
  profiles: "People directory",
  households: "Households",
  children: "Children directory",
  "attendance-report": "Attendance report",
  "attendance-absentees": "Absentee report",
  "attendance-email": "Absentee email",
  "children-email": "Children email",
  "profiles-email": "People email",
};

function eventFor(event: AccessEventRecord): { label: string; className: string } {
  if (event.eventType === "sign_in_denied") {
    return { label: "Sign-in denied", className: "bg-[#F6EDEA] text-[#B04A3A]" };
  }
  if (event.eventType === "sign_in") {
    return { label: "Signed in", className: "bg-[#EEF6EE] text-[#3F6B45]" };
  }
  const resourceLabel = event.resource ? (RESOURCE_LABEL[event.resource] ?? event.resource) : "Directory";
  return { label: `Viewed ${resourceLabel}`, className: "bg-[#EEF2F6] text-[#5B7185]" };
}

interface DayGroup {
  key: string;
  heading: string;
  people: PersonGroup[];
}

interface PersonGroup {
  key: string; // email — the stable identity; name is just the display label
  name: string;
  role: AccessEventRecord["role"];
  events: AccessEventRecord[];
}

// Groups most-recent-first events (as returned by the API) into day
// sections, and within each day into per-person sections — so an admin
// scanning the log sees "who did what today" rather than one long flat
// list of rows repeating the same email.
function groupByDayAndPerson(events: AccessEventRecord[]): DayGroup[] {
  const days = new Map<string, DayGroup>();
  for (const event of events) {
    const dKey = dayKey(event.occurredAt);
    let day = days.get(dKey);
    if (!day) {
      day = { key: dKey, heading: formatDayHeading(event.occurredAt), people: [] };
      days.set(dKey, day);
    }
    const pKey = event.email;
    let person = day.people.find((p) => p.key === pKey);
    if (!person) {
      person = { key: pKey, name: event.name ?? event.email, role: event.role, events: [] };
      day.people.push(person);
    }
    person.events.push(event);
  }
  return Array.from(days.values());
}

// Admin-only audit trail (ADR-0016): every sign-in (allowed or denied) and
// every directory read, most recent first, grouped by day and then by
// person.
export function ActivityLog() {
  const { data, error, isLoading } = useSWR<{ events: AccessEventRecord[] }>(
    "/api/access-events",
    fetcher,
    { refreshInterval: 30000 }
  );
  const events = data?.events ?? [];
  const days = groupByDayAndPerson(events);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[22px] font-semibold text-brand-navy">Activity Log</h1>
        <p className="mt-1 text-[13.5px] text-[#5B7185]">
          Who&apos;s signed in and who&apos;s read the directory, most recent first.
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-[15px] text-[#8A94A0]">Loading…</div>
      ) : error ? (
        <EmptyState message="Couldn't load the activity log." />
      ) : days.length === 0 ? (
        <EmptyState icon={<History className="h-6 w-6" />} message="No activity recorded yet." />
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <div key={day.key} className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#8A94A0]">{day.heading}</h2>
              <div className="flex flex-col gap-2">
                {day.people.map((person) => (
                  <div
                    key={person.key}
                    className="flex flex-col gap-2 rounded-[14px] border border-[#EAE2D0] bg-white px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14.5px] font-semibold text-brand-navy">{person.name}</span>
                      <span className="shrink-0 rounded-full bg-[#FAF7F1] px-2 py-0.5 text-[11px] font-semibold text-[#8A94A0]">
                        {ROLE_LABEL[person.role]}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {person.events.map((event) => {
                        const badge = eventFor(event);
                        return (
                          <div key={event.id} className="flex flex-wrap items-center gap-2">
                            <span className="w-[70px] shrink-0 text-[12.5px] text-[#8A94A0]">
                              {formatTime(event.occurredAt)}
                            </span>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
