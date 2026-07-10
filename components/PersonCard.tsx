import { Mail, Phone } from "lucide-react";
import type { Profile } from "@/types/profile";
import { AVATAR_TINTS, initialsOf } from "@/lib/avatar";
import { StatusBadge } from "@/components/StatusBadge";

// Pixel values transcribed from design/README.md §Member card grid (the
// mockup's "Member" naming became "People" in-app — see ADR-0008; this
// still renders any person regardless of membership status). Uses real
// Lucide icons in place of the mockup's placeholder CSS-shape icons.

export function PersonCard({ profile, index }: { profile: Profile; index: number }) {
  const tint = AVATAR_TINTS[index % AVATAR_TINTS.length];
  const householdCampus = [profile.household_name, profile.campus].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-3.5 rounded-[14px] border border-[#EAE2D0] bg-white p-5 shadow-[0_1px_3px_rgba(26,58,92,0.05)]">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full font-heading text-base font-semibold"
            style={{ backgroundColor: tint.bg, color: tint.text }}
          >
            {initialsOf(profile.first_name, profile.last_name)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-heading text-[17px] font-semibold text-brand-navy">
              {profile.first_name} {profile.last_name}
            </div>
            {householdCampus && (
              <div className="mt-0.5 truncate text-[12.5px] text-[#8A94A0]">{householdCampus}</div>
            )}
          </div>
        </div>
        <StatusBadge status={profile.status} className="shrink-0" />
      </div>

      <div className="h-px bg-[#F0EBDF]" />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 text-[13.5px] text-[#3E5670]">
          <Mail className="h-[13px] w-[13px] shrink-0 text-[#97A9B8]" />
          <span className="truncate">{profile.email}</span>
        </div>
        {profile.phone_number && (
          <div className="flex items-center gap-2.5 text-[13.5px] text-[#3E5670]">
            <Phone className="h-[13px] w-[13px] shrink-0 text-[#97A9B8]" />
            <span>{profile.phone_number}</span>
          </div>
        )}
      </div>
    </div>
  );
}
