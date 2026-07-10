import type { MemberStatus } from "@/types/profile";

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

export function StatusBadge({ status, className = "" }: { status: MemberStatus; className?: string }) {
  const style = STATUS_BADGE_STYLES[status];
  return (
    <span
      className={`whitespace-nowrap rounded-full px-[11px] py-1 text-[12px] font-semibold ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {status}
    </span>
  );
}
