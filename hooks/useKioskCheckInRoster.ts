"use client";

import { useKioskRoster } from "./useKioskRoster";
import { useRosterGrouping } from "./useCheckInRoster";
import type { AppEvent } from "@/types/event";

// The kiosk surface's roster: fetches via useKioskRoster (/api/kiosk/roster,
// which authorizes a device cookie or a signed-in session) and applies the
// household grouping/session-defaulting shared with the staff check-in page.
// ADR-0015 Phase 3.
export function useKioskCheckInRoster({ event, search }: { event: AppEvent; search: string }) {
  const { profiles, isLoading, hasFilter, suggestedSessions } = useKioskRoster({ eventId: event.id, search });
  return useRosterGrouping({ profiles, isLoading, hasFilter, event, suggestedSessionByProfileId: suggestedSessions });
}
