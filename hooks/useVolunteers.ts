"use client";

import useSWR from "swr";
import type { Campus } from "@/types/profile";
import type { VolunteerListResponse, VolunteerOptions } from "@/types/volunteer";

export interface UseVolunteersParams {
  search?: string;
  campus?: Campus[];
  teams?: string[];
  roles?: string[];
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function useVolunteers({ search, campus, teams, roles }: UseVolunteersParams) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  campus?.forEach((c) => params.append("campus", c));
  teams?.forEach((t) => params.append("team", t));
  roles?.forEach((r) => params.append("role", r));
  const key = `/api/volunteers?${params.toString()}`;
  const { data, error, isLoading, mutate } = useSWR<VolunteerListResponse>(key, fetcher, {
    keepPreviousData: true,
  });
  return { data, error, isLoading, mutate };
}

export function useVolunteerOptions() {
  const { data, mutate } = useSWR<VolunteerOptions>("/api/volunteers/options", fetcher);
  return { options: data ?? { teams: [], roles: [], manageableTeams: [] }, refreshOptions: mutate };
}
