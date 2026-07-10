"use client";

import useSWR from "swr";
import type { Campus } from "@/types/profile";
import type { HouseholdSearchResult } from "@/lib/subsplash";

export interface UseHouseholdsParams {
  search?: string;
  campus?: Campus;
  page?: number;
}

async function fetcher(url: string): Promise<HouseholdSearchResult> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch households: ${res.status}`);
  }
  return res.json();
}

export function useHouseholds({ search, campus, page = 1 }: UseHouseholdsParams) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (campus) params.set("campus", campus);
  params.set("page", String(page));

  const { data, error, isLoading } = useSWR<HouseholdSearchResult>(
    `/api/households?${params.toString()}`,
    fetcher
  );

  return { data, error, isLoading };
}
