"use client";

import useSWR from "swr";
import type { Campus, MemberStatus } from "@/types/profile";
import type { ProfileSearchResult } from "@/lib/subsplash";

export interface UsePeopleParams {
  search?: string;
  status?: MemberStatus;
  campus?: Campus;
  gradeFrom?: number;
  gradeTo?: number;
  page?: number;
}

async function fetcher(url: string): Promise<ProfileSearchResult> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch people: ${res.status}`);
  }
  return res.json();
}

export function usePeople({ search, status, campus, gradeFrom, gradeTo, page = 1 }: UsePeopleParams) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (campus) params.set("campus", campus);
  if (gradeFrom !== undefined) params.set("gradeFrom", String(gradeFrom));
  if (gradeTo !== undefined) params.set("gradeTo", String(gradeTo));
  params.set("page", String(page));

  const { data, error, isLoading } = useSWR<ProfileSearchResult>(
    `/api/profiles?${params.toString()}`,
    fetcher
  );

  return { data, error, isLoading };
}
