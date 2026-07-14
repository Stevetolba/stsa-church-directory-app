import Link from "next/link";
import { Cake } from "lucide-react";
import type { Profile } from "@/types/profile";
import { avatarTintForId, initialsOf } from "@/lib/avatar";
import { groupProfilesByUpcomingBirthday } from "@/lib/birthdays";
import { EmptyState } from "@/components/EmptyState";

// A Google-Calendar-"Schedule"-style agenda: birthdays grouped by upcoming
// date (not paginated — an agenda is meant to be scrolled through, not
// paged), starting from today and wrapping into next year. Shared by the
// staff/admin /birthdays page and the Children page's Birthdays view so
// both render identically regardless of who's allowed to see what data —
// the caller (already scoped by the same rules as the People/Children
// lists) decides which profiles this ever sees.
export function BirthdayAgenda({ profiles }: { profiles: Profile[] }) {
  const groups = groupProfilesByUpcomingBirthday(profiles);

  if (groups.length === 0) {
    return <EmptyState icon={<Cake className="h-6 w-6" />} message="No birthdays on file to show." />;
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.monthDay}>
          <div className="mb-2.5 flex items-baseline gap-2">
            <div className="text-[13px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
              {group.label}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {group.entries.map(({ profile, turningAge }) => {
              const tint = avatarTintForId(profile.id);
              const householdCampus = [profile.household_name, profile.campus].filter(Boolean).join(" · ");
              return (
                <Link
                  key={profile.id}
                  href={`/people/${profile.id}`}
                  className="flex items-center gap-3 rounded-[12px] border border-[#EAE2D0] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(26,58,92,0.05)] transition-colors hover:border-brand-navy/30"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-[13px] font-semibold"
                    style={{ backgroundColor: tint.bg, color: tint.text }}
                  >
                    {initialsOf(profile.first_name, profile.last_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-semibold text-brand-navy">
                      {profile.first_name} {profile.last_name}
                    </div>
                    {householdCampus && (
                      <div className="truncate text-[12.5px] text-[#8A94A0]">{householdCampus}</div>
                    )}
                  </div>
                  <div className="shrink-0 whitespace-nowrap rounded-full bg-[#EEF2F6] px-[11px] py-1 text-[12px] font-semibold text-[#4C6178]">
                    Turns {turningAge}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
