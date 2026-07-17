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

export interface CheckInArgs {
  profileId?: string;
  sessionId?: string;
  isGuest?: boolean;
  guestName?: string;
  backfill?: boolean;
}

// Live check-in state for one event occurrence (ADR-0015). Polls every 10s and
// revalidates on focus so several doors / kiosks running at once converge on
// the same checked-in list. Mutations revalidate immediately.
export function useAttendance(eventId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<AttendanceResponse>(
    eventId ? `/api/attendance?eventId=${encodeURIComponent(eventId)}` : null,
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: true }
  );

  async function mutateAndRevalidate(method: string, body: unknown) {
    const res = await fetch("/api/attendance", {
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
    checkIn: (args: CheckInArgs) => mutateAndRevalidate("POST", { eventId, ...args }),
    checkOut: (profileId: string) => mutateAndRevalidate("PATCH", { eventId, profileId }),
    undoCheckIn: (profileId: string) => mutateAndRevalidate("DELETE", { eventId, profileId }),
  };
}
