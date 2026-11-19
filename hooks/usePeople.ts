"use client";

import useSWR from "swr";
import type { BirthdayRange } from "@/lib/birthdays";
import type { Campus, MemberStatus } from "@/types/profile";
import type { ChildrenFilter, ProfileSearchResult, SearchProfilesParams } from "@/lib/subsplash";

export interface UsePeopleParams {
  search?: string;
  status?: MemberStatus[];
  campus?: Campus[];
  gradeFrom?: number;
  gradeTo?: number;
  ageFrom?: number;
  ageTo?: number;
  gender?: string[];
  maritalStatus?: string[];
  birthday?: BirthdayRange;
  sortBy?: SearchProfilesParams["sortBy"];
  page?: number;
  // Callers that need every match at once (e.g. the birthday agenda, which
  // can't sanely paginate a chronological list) can ask for a bigger page —
  // capped server-side the same way CSV export already is.
  pageSize?: number;
  withChildren?: ChildrenFilter;
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
  ageFrom,
  ageTo,
  gender,
  maritalStatus,
  birthday,
  sortBy,
  page = 1,
  pageSize,
  withChildren,
}: UsePeopleParams) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  status?.forEach((s) => params.append("status", s));
  campus?.forEach((c) => params.append("campus", c));
  if (gradeFrom !== undefined) params.set("gradeFrom", String(gradeFrom));
  if (gradeTo !== undefined) params.set("gradeTo", String(gradeTo));
  if (ageFrom !== undefined) params.set("ageFrom", String(ageFrom));
  if (ageTo !== undefined) params.set("ageTo", String(ageTo));
  gender?.forEach((g) => params.append("gender", g));
  maritalStatus?.forEach((m) => params.append("maritalStatus", m));
  if (birthday) params.set("birthday", birthday);
  if (sortBy) params.set("sortBy", sortBy);
  if (pageSize !== undefined) params.set("pageSize", String(pageSize));
  if (withChildren) {
    params.set("childrenMode", withChildren.mode);
    if (withChildren.gradeFrom !== undefined) params.set("childGradeFrom", String(withChildren.gradeFrom));
    if (withChildren.gradeTo !== undefined) params.set("childGradeTo", String(withChildren.gradeTo));
    if (withChildren.ageFrom !== undefined) params.set("childAgeFrom", String(withChildren.ageFrom));
    if (withChildren.ageTo !== undefined) params.set("childAgeTo", String(withChildren.ageTo));
  }
  params.set("page", String(page));

  const { data, error, isLoading } = useSWR<ProfileSearchResult>(
    `/api/profiles?${params.toString()}`,
    fetcher
  );

  return { data, error, isLoading };
}
