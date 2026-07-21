"use client";

import useSWR from "swr";
import { History } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

interface AccessEventRecord {
  id: string;
  occurredAt: string;
  email: string;
  role: "admin" | "staff" | "volunteer";
  eventType: "sign_in" | "sign_in_denied" | "directory_read";
  resource: string | null;
}

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load activity: ${res.status}`);
  return res.json();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

// Admin-only audit trail (ADR-0016): every sign-in (allowed or denied) and
// every directory read, most recent first. Read-only — there's nothing to
// create/revoke here, unlike DeviceManager.
export function ActivityLog() {
  const { data, error, isLoading } = useSWR<{ events: AccessEventRecord[] }>(
    "/api/access-events",
    fetcher,
    { refreshInterval: 30000 }
  );
  const events = data?.events ?? [];

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
      ) : events.length === 0 ? (
        <EmptyState icon={<History className="h-6 w-6" />} message="No activity recorded yet." />
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((event) => {
            const badge = eventFor(event);
            return (
              <div
                key={event.id}
                className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#EAE2D0] bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14.5px] font-semibold text-brand-navy">{event.email}</span>
                    <span className="shrink-0 rounded-full bg-[#FAF7F1] px-2 py-0.5 text-[11px] font-semibold text-[#8A94A0]">
                      {ROLE_LABEL[event.role]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-[#8A94A0]">{formatDateTime(event.occurredAt)}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${badge.className}`}>
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
