"use client";

import useSWR from "swr";
import type { Campus, MemberStatus } from "@/types/profile";
import type { ProfileSearchResult, SearchProfilesParams } from "@/lib/subsplash";

export interface UsePeopleParams {
  search?: string;
  status?: MemberStatus[];
  campus?: Campus[];
  gradeFrom?: number;
  gradeTo?: number;
  sortBy?: SearchProfilesParams["sortBy"];
  page?: number;
}

async function fetcher(url: string): Promise<ProfileSearchResult> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch people: ${res.status}`);
  }
  return res.json();
}

export function usePeople({
  search,
  status,
  campus,
  gradeFrom,
  gradeTo,
  sortBy,
  page = 1,
}: UsePeopleParams) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  status?.forEach((s) => params.append("status", s));
  campus?.forEach((c) => params.append("campus", c));
  if (gradeFrom !== undefined) params.set("gradeFrom", String(gradeFrom));
  if (gradeTo !== undefined) params.set("gradeTo", String(gradeTo));
  if (sortBy) params.set("sortBy", sortBy);
  params.set("page", String(page));

  const { data, error, isLoading } = useSWR<ProfileSearchResult>(
    `/api/profiles?${params.toString()}`,
    fetcher
  );

  return { data, error, isLoading };
}
