"use client";

import useSWR from "swr";
import type { Campus, MemberStatus } from "@/types/profile";
import type { ProfileSearchResult } from "@/lib/subsplash";

export interface UsePeopleParams {
  search?: string;
  status?: MemberStatus;
  campus?: Campus;
  page?: number;
}

async function fetcher(url: string): Promise<ProfileSearchResult> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch people: ${res.status}`);
  }
  return res.json();
}

export function usePeople({ search, status, campus, page = 1 }: UsePeopleParams) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (campus) params.set("campus", campus);
  params.set("page", String(page));

  const { data, error, isLoading } = useSWR<ProfileSearchResult>(
    `/api/profiles?${params.toString()}`,
    fetcher
  );

  return { data, error, isLoading };
}
