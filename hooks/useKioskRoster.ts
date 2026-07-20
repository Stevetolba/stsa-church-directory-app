"use client";

import useSWR from "swr";
import type { ProfileSearchResult } from "@/lib/subsplash";

async function fetcher(url: string): Promise<ProfileSearchResult> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load roster: ${res.status}`);
  return res.json();
}

// The kiosk-scoped counterpart to useRoster (hooks/useRoster.ts): always
// hits /api/kiosk/roster, which resolves the searchable pool and field
// projection from the request's session or device cookie server-side
// (ADR-0015 Phase 3) — the client doesn't pass a role, since a device has
// none. Only fetches once search text is entered, same as useRoster.
export function useKioskRoster({ search }: { search?: string }) {
  const hasFilter = !!search?.trim();
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("pageSize", "2000");
  params.set("expandHouseholds", "true");

  const { data, error, isLoading } = useSWR<ProfileSearchResult>(
    hasFilter ? `/api/kiosk/roster?${params.toString()}` : null,
    fetcher
  );

  return { profiles: data?.profiles ?? [], total: data?.total ?? 0, error, isLoading, hasFilter };
}
