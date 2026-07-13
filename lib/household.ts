import type { Campus } from "@/types/profile";
import type { Household, HouseholdAddress } from "@/types/household";

// Single-line display string from structured parts, e.g.
// "142 Maple Street, Arlington, VA 22201". Matches the format the mock
// fixtures were authored in, so parseAddressString round-trips it.
export function formatAddressParts(parts: HouseholdAddress | undefined): string | undefined {
  if (!parts) return undefined;
  const cityStateZip = [parts.city, [parts.state, parts.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [parts.street, cityStateZip].filter(Boolean).join(", ") || undefined;
}

// Inverse of formatAddressParts, used only for mock data (which stores a
// single display string). Real data arrives already structured from
// Subsplash's _embedded.address, so this never runs against live data.
export function parseAddressString(address: string | undefined): HouseholdAddress | undefined {
  if (!address) return undefined;
  const segments = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return undefined;
  const street = segments[0];
  // Last segment looks like "VA 22201" when a full address was provided.
  const stateZip = segments.length >= 3 ? segments[segments.length - 1] : undefined;
  const city = segments.length >= 3 ? segments.slice(1, -1).join(", ") : undefined;
  let state: string | undefined;
  let postal_code: string | undefined;
  if (stateZip) {
    const match = stateZip.match(/^([A-Za-z]{2})\s+(.+)$/);
    if (match) {
      state = match[1];
      postal_code = match[2];
    } else {
      state = stateZip;
    }
  }
  return { street, city, state, postal_code };
}

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
