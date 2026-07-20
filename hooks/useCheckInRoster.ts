"use client";

import { useMemo, useState } from "react";
import { useRoster } from "./useRoster";
import { defaultSessionForProfile, eventAutoSessionType } from "@/lib/sessionMapping";
import type { AppEvent, SessionType } from "@/types/event";
import type { Profile } from "@/types/profile";
import type { Role } from "@/types/auth";

export interface HouseholdGroup {
  householdId: string;
  name: string;
  members: Profile[];
  adults: Profile[];
}

// Groups an already-fetched roster by household, applies the session-type
// restriction (a "child"/"adult" session only shows that role; "everyone"
// and mixed events show both), and tracks the per-profile session pick and
// per-household drop-off adult. Pulled out of useCheckInRoster so both the
// signed-in check-in page (which fetches via /api/children or /api/profiles,
// see useRoster) and the kiosk surface (which fetches via /api/kiosk/roster,
// see useKioskCheckInRoster) share the identical, non-trivial grouping/
// defaulting rules without duplicating them. ADR-0015.
export function useRosterGrouping({
  profiles,
  isLoading,
  hasFilter,
  event,
  manualChildrenOnly = false,
}: {
  profiles: Profile[];
  isLoading: boolean;
  hasFilter: boolean;
  event: AppEvent;
  manualChildrenOnly?: boolean;
}) {
  const [sessionByProfile, setSessionByProfile] = useState<Record<string, string>>({});
  const [dropOffByHousehold, setDropOffByHousehold] = useState<Record<string, string>>({});

  const autoSessionType: SessionType | null = useMemo(
    () => eventAutoSessionType(event.sessions),
    [event.sessions]
  );
  const showManualChildrenToggle = autoSessionType === null;
  const householdRoleFilter: "child" | "adult" | null =
    autoSessionType === "child" || autoSessionType === "adult"
      ? autoSessionType
      : autoSessionType === null && manualChildrenOnly
        ? "child"
        : null;

  const households: HouseholdGroup[] = useMemo(() => {
    // Group ALL matching profiles by household first (not role-filtered) —
    // a "children only" session still needs its households' adults on hand
    // for the drop-off picker, even though they won't show as selectable
    // rows.
    const byHousehold = new Map<string, { householdId: string; name: string; allMembers: Profile[] }>();
    for (const p of profiles) {
      const key = p.household_id ?? p.id;
      const name = p.household_name ?? `${p.first_name} ${p.last_name}`.trim();
      const group = byHousehold.get(key) ?? { householdId: key, name, allMembers: [] };
      group.allMembers.push(p);
      byHousehold.set(key, group);
    }
    const rank = (p: Profile) => (p.household_role === "child" ? 1 : 0);
    const groups = Array.from(byHousehold.values()).map((g) => {
      const members =
        householdRoleFilter === "child"
          ? g.allMembers.filter((p) => p.household_role === "child")
          : householdRoleFilter === "adult"
            ? g.allMembers.filter((p) => p.household_role !== "child")
            : g.allMembers;
      return {
        householdId: g.householdId,
        name: g.name,
        members: [...members].sort(
          (a, b) => rank(a) - rank(b) || `${a.first_name}`.localeCompare(`${b.first_name}`)
        ),
        adults: g.allMembers.filter((p) => p.household_role !== "child"),
      };
    });
    return groups.filter((g) => g.members.length > 0).sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles, householdRoleFilter]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  // profileId -> its household group, so a batch check-in handler can find
  // the chosen (or auto-defaulted) drop-off adult for a child without a
  // separate lookup structure.
  const groupByProfileId = useMemo(() => {
    const m = new Map<string, HouseholdGroup>();
    for (const g of households) for (const p of g.members) m.set(p.id, g);
    return m;
  }, [households]);

  // Explicit pick, or the household's sole adult if there's exactly one —
  // otherwise undefined (ambiguous, left for the operator to choose).
  function dropOffForHousehold(group: { householdId: string; adults: Profile[] }): string | undefined {
    const explicit = dropOffByHousehold[group.householdId];
    if (explicit) return explicit;
    return group.adults.length === 1 ? group.adults[0].id : undefined;
  }

  function sessionForProfile(profile: Profile): string | undefined {
    if (sessionByProfile[profile.id]) return sessionByProfile[profile.id];
    return defaultSessionForProfile(event.sessions, profile)?.id;
  }

  return {
    profiles,
    isLoading,
    hasFilter,
    autoSessionType,
    showManualChildrenToggle,
    households,
    profileById,
    groupByProfileId,
    dropOffForHousehold,
    setDropOffFor: (householdId: string, profileId: string) =>
      setDropOffByHousehold((prev) => ({ ...prev, [householdId]: profileId })),
    sessionForProfile,
    setSessionFor: (profileId: string, sessionId: string) =>
      setSessionByProfile((prev) => ({ ...prev, [profileId]: sessionId })),
  };
}

// The signed-in check-in page's roster: fetches via useRoster (/api/children
// or /api/profiles, chosen by role) and applies the shared grouping above.
export function useCheckInRoster({
  event,
  role,
  search,
  manualChildrenOnly = false,
}: {
  event: AppEvent;
  role: Role;
  search: string;
  manualChildrenOnly?: boolean;
}) {
  const { profiles, isLoading, hasFilter } = useRoster({ role, search });
  return useRosterGrouping({ profiles, isLoading, hasFilter, event, manualChildrenOnly });
}
