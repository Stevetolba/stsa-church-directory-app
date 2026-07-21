"use client";

import useSWR from "swr";
import type { ProfileSearchResult } from "@/lib/subsplash";

interface KioskRosterResult extends ProfileSearchResult {
  // profile id -> session id, computed server-side from the profile's real
  // DOB/grade (ADR-0015) so a device actor's stripped roster response never
  // needs to carry date of birth itself for session auto-selection to work.
  // Only present when eventId was passed.
  suggestedSessions?: Record<string, string>;
}

async function fetcher(url: string): Promise<KioskRosterResult> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load roster: ${res.status}`);
  return res.json();
}

// The kiosk-scoped counterpart to useRoster (hooks/useRoster.ts): always
// hits /api/kiosk/roster, which resolves the searchable pool and field
// projection from the request's session or device cookie server-side
// (ADR-0015 Phase 3) — the client doesn't pass a role, since a device has
// none. Only fetches once search text is entered, same as useRoster.
export function useKioskRoster({ eventId, search }: { eventId: string; search?: string }) {
  const hasFilter = !!search?.trim();
  const params = new URLSearchParams({ eventId });
  if (search) params.set("search", search);
  params.set("pageSize", "2000");
  params.set("expandHouseholds", "true");

  const { data, error, isLoading } = useSWR<KioskRosterResult>(
    hasFilter ? `/api/kiosk/roster?${params.toString()}` : null,
    fetcher
  );

  return {
    profiles: data?.profiles ?? [],
    total: data?.total ?? 0,
    suggestedSessions: data?.suggestedSessions,
    error,
    isLoading,
    hasFilter,
  };
}
