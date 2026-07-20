"use client";

import useSWR from "swr";
import type { AppEvent } from "@/types/event";
import type { AttendanceSummary, CheckInRecord } from "@/types/attendance";

interface AttendanceResponse {
  event: AppEvent;
  records: CheckInRecord[];
  summary: AttendanceSummary;
}

async function fetcher(url: string): Promise<AttendanceResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch attendance: ${res.status}`);
  return res.json();
}

export interface KioskCheckInArgs {
  profileId: string;
  sessionId?: string;
  // For a child, the adult household member who dropped them off. Ignored by
  // the server for a non-child check-in.
  dropOffProfileId?: string;
  // Client-generated pickup match code (see components/labels). Ignored by
  // the server for a non-child check-in, same as dropOffProfileId.
  matchCode?: string;
}

// The kiosk surface's live attendance state: hits /api/kiosk/attendance,
// which accepts a device cookie as well as a signed-in session and — unlike
// useAttendance — never offers backfill (POST) or undo (no DELETE at all).
// Those stay staff-only on the regular check-in page. Polls every 10s and
// revalidates on focus so several doors/kiosks converge (ADR-0015 Phase 3).
export function useKioskAttendance(eventId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<AttendanceResponse>(
    eventId ? `/api/kiosk/attendance?eventId=${encodeURIComponent(eventId)}` : null,
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: true }
  );

  async function mutateAndRevalidate(method: string, body: unknown) {
    const res = await fetch("/api/kiosk/attendance", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Request failed: ${res.status}`);
    }
    await mutate();
    return res.json();
  }

  return {
    event: data?.event,
    records: data?.records ?? [],
    summary: data?.summary,
    error,
    isLoading,
    mutate,
    checkIn: (args: KioskCheckInArgs) => mutateAndRevalidate("POST", { eventId, ...args }),
    checkOut: (profileId: string) => mutateAndRevalidate("PATCH", { eventId, profileId }),
  };
}
