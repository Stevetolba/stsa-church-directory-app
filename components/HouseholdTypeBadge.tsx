import type { HouseholdRole } from "@/types/profile";

// Coarser Adult/Child/Unknown grouping shown next to a person's name in a
// household member list — guardian/parent/other all collapse to "Adult",
// distinct from the granular Role field shown on a profile's own detail
// page (Guardian/Parent/Child/Other/Unknown).
type HouseholdMemberType = "Adult" | "Child" | "Unknown";

function householdMemberType(role: HouseholdRole | undefined): HouseholdMemberType {
  if (role === "child") return "Child";
  if (!role || role === "unknown") return "Unknown";
  return "Adult";
}

export function HouseholdTypeBadge({ role }: { role: HouseholdRole | undefined }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-[#EEF2F6] px-[9px] py-[3px] text-[11px] font-semibold text-[#4C6178]">
      {householdMemberType(role)}
    </span>
  );
}
