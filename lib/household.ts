import type { Campus } from "@/types/profile";
import type { Household } from "@/types/household";

// Households don't have their own campus field (neither in our data model
// nor Subsplash's) — campus lives on each member's profile. This derives a
// single representative campus for household-level display/filtering,
// preferring whoever is responsible for the household.
export function householdCampus(household: Household): Campus | undefined {
  const representative =
    household.members?.find((m) => m.household_role === "guardian" || m.household_role === "parent") ??
    household.members?.[0];
  return representative?.campus;
}
