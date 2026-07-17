"use client";

import useSWR from "swr";
import type { Campus, Profile } from "@/types/profile";
import type { ProfileSearchResult } from "@/lib/subsplash";
import type { Role } from "@/types/auth";

async function fetcher(url: string): Promise<ProfileSearchResult> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load roster: ${res.status}`);
  return res.json();
}

export interface UseRosterParams {
  role: Role;
  search?: string;
  campus?: Campus[];
  gradeFrom?: number;
  gradeTo?: number;
}

// The people a check-in operator can pull up. Volunteers hit /api/children
// (child-bearing households, families included via memberType=All) since
// they're blocked from /api/profiles; staff/admin get the full directory. Both
// fetch a wide page so the roster can group by household client-side. ADR-0015
// / ADR-0011.
//
// Only fetches once actual search text is entered — mirrors Subsplash's own
// kiosk app (search first, then a household/person picker), and specifically
// means a session-type auto-restriction (children-only, etc.) alone must
// never reveal the whole directory; campus/grade only narrow an existing
// search, they don't unlock the roster on their own.
export function useRoster({ role, search, campus, gradeFrom, gradeTo }: UseRosterParams) {
  const isVolunteer = role === "volunteer";
  const hasFilter = !!search?.trim();

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  campus?.forEach((c) => params.append("campus", c));
  if (gradeFrom !== undefined) params.set("gradeFrom", String(gradeFrom));
  if (gradeTo !== undefined) params.set("gradeTo", String(gradeTo));
  params.set("pageSize", "2000");
  if (isVolunteer) params.set("memberType", "All");

  const endpoint = isVolunteer ? "/api/children" : "/api/profiles";
  const { data, error, isLoading } = useSWR<ProfileSearchResult>(
    hasFilter ? `${endpoint}?${params.toString()}` : null,
    fetcher
  );

  const profiles: Profile[] = data?.profiles ?? [];
  return { profiles, total: data?.total ?? 0, error, isLoading, hasFilter };
}
