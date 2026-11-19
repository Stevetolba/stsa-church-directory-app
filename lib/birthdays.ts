import type { Profile } from "@/types/profile";
import { churchToday } from "./churchTime";

export interface BirthdayEntry {
  profile: Profile;
  turningAge: number;
}

export interface BirthdayGroup {
  monthDay: string; // "MM-DD" — stable key, independent of any particular year
  label: string; // "Today" | "Tomorrow" | "Monday, March 3"
  daysUntil: number;
  entries: BirthdayEntry[];
}

// Parses an ISO date string (e.g. "1968-04-12") into local-date parts,
// avoiding the UTC-vs-local off-by-one-day issue `new Date(iso)` has for
// date-only strings — same technique lib/utils.ts's formatDate uses.
function parseIsoDateParts(iso: string): { year: number; month: number; day: number } | null {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

// month is 1-indexed (matches the ISO string); Date wants 0-indexed.
function dayStart(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

// Groups profiles by their upcoming birthday (month/day only — the actual
// birth year only matters for computing the age they're turning), ordered
// chronologically starting from today and wrapping into next year. A
// birthday earlier this calendar year than today rolls to next year's
// occurrence, same as any real "upcoming events" agenda would show it.
export function groupProfilesByUpcomingBirthday(
  profiles: Profile[],
  today: Date = churchToday()
): BirthdayGroup[] {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const groups = new Map<string, BirthdayGroup>();

  for (const profile of profiles) {
    if (!profile.date_of_birth) continue;
    const parts = parseIsoDateParts(profile.date_of_birth);
    if (!parts) continue;

    let nextOccurrence = dayStart(todayStart.getFullYear(), parts.month, parts.day);
    if (nextOccurrence.getTime() < todayStart.getTime()) {
      nextOccurrence = dayStart(todayStart.getFullYear() + 1, parts.month, parts.day);
    }
    const daysUntil = Math.round((nextOccurrence.getTime() - todayStart.getTime()) / 86400000);
    const turningAge = nextOccurrence.getFullYear() - parts.year;
    // Keyed on the *observed* occurrence (handles Feb 29 rolling to Mar 1 in
    // a non-leap year consistently with the label below, which is derived
    // from the same nextOccurrence date).
    const monthDay = `${String(nextOccurrence.getMonth() + 1).padStart(2, "0")}-${String(
      nextOccurrence.getDate()
    ).padStart(2, "0")}`;

    let group = groups.get(monthDay);
    if (!group) {
      let label: string;
      if (daysUntil === 0) label = "Today";
      else if (daysUntil === 1) label = "Tomorrow";
      else {
        label = nextOccurrence.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
      }
      group = { monthDay, label, daysUntil, entries: [] };
      groups.set(monthDay, group);
    }
    group.entries.push({ profile, turningAge });
  }

  const groupList = Array.from(groups.values());
  for (const group of groupList) {
    group.entries.sort((a, b) => a.profile.last_name.localeCompare(b.profile.last_name));
  }

  return groupList.sort((a, b) => a.daysUntil - b.daysUntil);
}

// --- Birthday filter (People page) ---

export type BirthdayRange = "today" | "this_week" | "this_month" | "next_month";

export const BIRTHDAY_RANGES: { value: BirthdayRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "next_month", label: "Next month" },
];

// Whether `dateOfBirth`'s month/day falls in the given range relative to
// `today`. Year of birth is ignored. "This week" is Sunday–Saturday of the
// current week (matching Subsplash's own People-page Birthday filter), and
// is checked against the previous/current/next year's occurrence so a week
// that straddles New Year still matches.
export function matchesBirthdayRange(
  dateOfBirth: string | undefined,
  range: BirthdayRange,
  today: Date = churchToday()
): boolean {
  if (!dateOfBirth) return false;
  const parts = parseIsoDateParts(dateOfBirth);
  if (!parts) return false;

  const year = today.getFullYear();
  const todayMonth = today.getMonth() + 1;

  if (range === "today") return parts.month === todayMonth && parts.day === today.getDate();
  if (range === "this_month") return parts.month === todayMonth;
  if (range === "next_month") return parts.month === (todayMonth % 12) + 1;

  const weekStart = dayStart(year, todayMonth, today.getDate() - today.getDay()).getTime();
  const weekEnd = weekStart + 6 * 86400000;
  return [year - 1, year, year + 1].some((y) => {
    const t = dayStart(y, parts.month, parts.day).getTime();
    return t >= weekStart && t <= weekEnd;
  });
}
