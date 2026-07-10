import { Mail, Phone } from "lucide-react";
import type { MemberStatus, Profile } from "@/types/profile";

// Pixel values transcribed from design/README.md §Member card grid. Uses
// real Lucide icons in place of the mockup's placeholder CSS-shape icons.

const AVATAR_TINTS = [
  { bg: "#D8EFFB", text: "#1B6E93" },
  { bg: "#DCE6EE", text: "#2E4E6E" },
  { bg: "#E9E2F0", text: "#5B4A80" },
  { bg: "#E6EEE1", text: "#3F6B45" },
];

// Member/Regular Attendee/Visitor colors are mockup-specified. Newcomer and
// Former Attender are new (ADR-0006) — Newcomer reuses the "Staff only"
// badge's sky-blue tint (fits "fresh"), Former Attender reuses the
// divider/muted-text neutral (fits "past/inactive") rather than inventing
// new hues outside the established palette.
const STATUS_BADGE_STYLES: Record<MemberStatus, { bg: string; text: string }> = {
  Member: { bg: "#EAF1E9", text: "#3F6B45" },
  "Regular Attendee": { bg: "#FDF1DC", text: "#8A6A24" },
  Visitor: { bg: "#EEF2F6", text: "#4C6178" },
  Newcomer: { bg: "#E4F4FC", text: "#1B6E93" },
  "Former Attender": { bg: "#F0EBDF", text: "#8A94A0" },
};

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function MemberCard({ profile, index }: { profile: Profile; index: number }) {
  const tint = AVATAR_TINTS[index % AVATAR_TINTS.length];
  const badge = STATUS_BADGE_STYLES[profile.status];
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
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-[11px] py-1 text-[12px] font-semibold"
          style={{ backgroundColor: badge.bg, color: badge.text }}
        >
          {profile.status}
        </span>
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
