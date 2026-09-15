"use client";

import useSWR from "swr";
import type { Campus, MemberStatus } from "@/types/profile";
import type { HouseholdChildrenMode, HouseholdSearchResult } from "@/lib/subsplash";

export interface UseHouseholdsParams {
  search?: string;
  campus?: Campus[];
  status?: MemberStatus[];
  gradeFrom?: number;
  gradeTo?: number;
  childrenMode?: HouseholdChildrenMode;
  page?: number;
  // Same "fetch every match" escape hatch People's export/Show All already use.
  pageSize?: number;
}

async function fetcher(url: string): Promise<HouseholdSearchResult> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch households: ${res.status}`);
  }
  return res.json();
}

export function useHouseholds({
  search,
  campus,
  status,
  gradeFrom,
  gradeTo,
  childrenMode,
  page = 1,
  pageSize,
}: UseHouseholdsParams) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  campus?.forEach((c) => params.append("campus", c));
  status?.forEach((s) => params.append("status", s));
  if (gradeFrom !== undefined) params.set("gradeFrom", String(gradeFrom));
  if (gradeTo !== undefined) params.set("gradeTo", String(gradeTo));
  if (childrenMode) params.set("childrenMode", childrenMode);
  if (pageSize !== undefined) params.set("pageSize", String(pageSize));
  params.set("page", String(page));

  const { data, error, isLoading } = useSWR<HouseholdSearchResult>(
    `/api/households?${params.toString()}`,
    fetcher
  );

  return { data, error, isLoading };
}
