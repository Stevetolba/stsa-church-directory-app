"use client";

import useSWR from "swr";
import type { Campus, MemberStatus } from "@/types/profile";
import type { ChildrenMemberType, ProfileSearchResult, SearchProfilesParams } from "@/lib/subsplash";

// ADR-0011: same shape as usePeople, but hits /api/children — a separate
// endpoint so volunteers (blocked from /api/profiles) can still load the
// children-scoped list. The result type is identical (ProfileSearchResult).
export interface UseChildrenParams {
  search?: string;
  status?: MemberStatus[];
  campus?: Campus[];
  gradeFrom?: number;
  gradeTo?: number;
  ageFrom?: number;
  ageTo?: number;
  memberType?: ChildrenMemberType;
  sortBy?: SearchProfilesParams["sortBy"];
  page?: number;
  // Callers that need every match at once (e.g. the birthday agenda, which
  // can't sanely paginate a chronological list) can ask for a bigger page —
  // capped server-side the same way CSV export already is.
  pageSize?: number;
}

async function fetcher(url: string): Promise<ProfileSearchResult> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch children: ${res.status}`);
  }
  return res.json();
}

export function useChildren({
  search,
  status,
  campus,
  gradeFrom,
  gradeTo,
  ageFrom,
  ageTo,
  memberType,
  sortBy,
  page = 1,
  pageSize,
}: UseChildrenParams) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  status?.forEach((s) => params.append("status", s));
  campus?.forEach((c) => params.append("campus", c));
  if (gradeFrom !== undefined) params.set("gradeFrom", String(gradeFrom));
  if (gradeTo !== undefined) params.set("gradeTo", String(gradeTo));
  if (ageFrom !== undefined) params.set("ageFrom", String(ageFrom));
  if (ageTo !== undefined) params.set("ageTo", String(ageTo));
  if (memberType) params.set("memberType", memberType);
  if (sortBy) params.set("sortBy", sortBy);
  if (pageSize !== undefined) params.set("pageSize", String(pageSize));
  params.set("page", String(page));

  const { data, error, isLoading } = useSWR<ProfileSearchResult>(
    `/api/children?${params.toString()}`,
    fetcher
  );

  return { data, error, isLoading };
}
