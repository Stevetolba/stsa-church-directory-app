"use client";

import useSWR from "swr";
import type { AppEvent } from "@/types/event";
import type { SeriesOccurrence } from "@/lib/events";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  return res.json();
}

export interface UseEventsParams {
  today?: boolean;
  from?: string;
  to?: string;
  search?: string;
  includeDrafts?: boolean;
}

// Lists events for the check-in surfaces (ADR-0015). Refreshes on focus so a
// door device picks up newly-published events without a manual reload.
export function useEvents(params: UseEventsParams = {}) {
  const qs = new URLSearchParams();
  if (params.today) qs.set("today", "true");
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.search) qs.set("search", params.search);
  if (params.includeDrafts) qs.set("includeDrafts", "true");

  const { data, error, isLoading, mutate } = useSWR<{ events: AppEvent[] }>(
    `/api/events?${qs.toString()}`,
    fetcher
  );
  return { events: data?.events ?? [], error, isLoading, mutate };
}

export function useEvent(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{
    event: AppEvent;
    occurrences: SeriesOccurrence[];
  }>(id ? `/api/events/${id}` : null, fetcher);
  return {
    event: data?.event,
    occurrences: data?.occurrences ?? [],
    error,
    isLoading,
    mutate,
  };
}
