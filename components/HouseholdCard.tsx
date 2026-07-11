import Link from "next/link";
import { Home } from "lucide-react";
import type { Household } from "@/types/household";
import { AVATAR_TINTS, initialsOf } from "@/lib/avatar";
import { householdCampus } from "@/lib/household";

// Pixel values transcribed from design/README.md §Household card grid.
//
// The whole card is clickable to the household, but the avatar bubbles are
// *also* individually clickable to that person's own profile — a real bug
// report (avatars looked like people you could click into, but the entire
// card was one <Link> to the household, so they weren't). Nesting an <a>
// inside an <a> isn't valid HTML, so this uses the "stretched link"
// pattern instead: the household name is a real, small <Link> whose
// ::after pseudo-element is stretched (`absolute inset-0`) to cover the
// whole card, sitting *below* the avatar Links in z-index so the avatars
// still win the hit-test over the areas they occupy.

export function HouseholdCard({ household }: { household: Household }) {
  const campus = householdCampus(household);
  const memberCount = household.members?.length ?? 0;
  const previewMembers = household.members?.slice(0, 4) ?? [];

  return (
    <div className="relative flex cursor-pointer flex-col gap-3.5 rounded-[14px] border border-[#EAE2D0] bg-white p-5 shadow-[0_1px_3px_rgba(26,58,92,0.05)]">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[12px] bg-[#E4F4FC] text-[#1B6E93]">
            <Home className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <Link
              href={`/households/${household.id}`}
              className="truncate font-heading text-[17px] font-semibold text-brand-navy after:absolute after:inset-0 after:z-0 hover:underline"
            >
              {household.name}
            </Link>
            <div className="mt-0.5 truncate text-[12.5px] text-[#8A94A0]">
              {[campus, `${memberCount} member${memberCount === 1 ? "" : "s"}`]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
        {campus && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-[#EEF2F6] px-[11px] py-1 text-[12px] font-semibold text-[#4C6178]">
            {campus}
          </span>
        )}
      </div>

      <div className="h-px bg-[#F0EBDF]" />

      {household.address && <div className="text-[13.5px] text-[#3E5670]">{household.address}</div>}

      {previewMembers.length > 0 && (
        <div className="flex items-center">
          {previewMembers.map((member, index) => {
            const tint = AVATAR_TINTS[index % AVATAR_TINTS.length];
            const name = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();
            return (
              <Link
                key={member.id}
                href={`/people/${member.id}`}
                title={name || undefined}
                aria-label={name || "View profile"}
                className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold transition-transform hover:z-20 hover:scale-110"
                style={{
                  backgroundColor: tint.bg,
                  color: tint.text,
                  marginLeft: index === 0 ? 0 : "-8px",
                }}
              >
                {initialsOf(member.first_name, member.last_name)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
