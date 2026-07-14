import type { HouseholdRole } from "@/types/profile";
import { householdMemberType } from "@/lib/household";

export function HouseholdTypeBadge({ role }: { role: HouseholdRole | undefined }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-[#EEF2F6] px-[9px] py-[3px] text-[11px] font-semibold text-[#4C6178]">
      {householdMemberType(role)}
    </span>
  );
}
