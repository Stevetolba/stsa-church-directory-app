// Maps a person to the check-in session (class/room) they most likely belong
// in, so the roster can pre-select it (ADR-0015). A "child" session's real
// suggestionType/minGrade/maxGrade/minAgeMonths/maxAgeMonths (confirmed
// against the live org — see types/event.ts) are tried first when present,
// since they're authoritative; the session-name text heuristic below is a
// fallback for sessions that don't carry that data. A volunteer can always
// override. Pure — unit-tested in lib/sessionMapping.test.ts.

import type { EventSession } from "@/types/event";
import type { Profile } from "@/types/profile";
import { calculateAgeInMonths } from "./age";

// Subsplash academic_grade_value scale (lib/grades.ts): Pre-K=1, Kindergarten=2,
// then value = school grade + 2 (1st=3 … 12th=14). Convert a grade value to a
// comparable "school grade number" where Pre-K=0, K=0.5, 1st=1 … 12th=12.
function schoolGradeNumber(gradeValue: number): number {
  if (gradeValue <= 1) return 0; // Pre-K
  if (gradeValue === 2) return 0.5; // Kindergarten
  return gradeValue - 2; // 1st..12th
}

interface SessionRange {
  session: EventSession;
  min: number; // inclusive school-grade number
  max: number;
}

// Parse a session name into the school-grade range it serves.
function parseSessionRange(session: EventSession): SessionRange | null {
  if (session.type !== "child") return null; // type is ground truth, unlike the name text below
  const name = session.name.toLowerCase();
  const isPreK = /pre-?k|nursery/.test(name);
  const isKinder = /kinder/.test(name);
  const ints = (name.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 0 && n <= 12);

  if (ints.length >= 2) {
    return { session, min: Math.min(...ints), max: Math.max(...ints) };
  }
  if (ints.length === 1) {
    return { session, min: ints[0], max: ints[0] };
  }
  if (isPreK && isKinder) return { session, min: 0, max: 0.5 };
  if (isPreK) return { session, min: 0, max: 0 };
  if (isKinder) return { session, min: 0.5, max: 0.5 };
  if (/youth|teen/.test(name)) return { session, min: 6, max: 12 };
  return null;
}

// Best session for a given grade value, or undefined if none fits.
export function pickSessionForGrade(
  sessions: EventSession[],
  gradeValue: number | undefined
): EventSession | undefined {
  if (gradeValue === undefined) return undefined;
  const grade = schoolGradeNumber(gradeValue);
  const ranges = sessions
    .map(parseSessionRange)
    .filter((r): r is SessionRange => r !== null);
  // Prefer the narrowest range that contains the grade (a specific "Pre-K"
  // wins over a broad "Youth (6–12)" if both somehow matched).
  const matches = ranges
    .filter((r) => grade >= r.min && grade <= r.max)
    .sort((a, b) => a.max - a.min - (b.max - b.min));
  return matches[0]?.session;
}

// Whether a child session's real suggestion data (not its name) matches the
// profile. suggestionType gates which fields are trusted — a session has
// been observed with a stray minGrade populated even when suggestionType is
// "age" or "none" (see types/event.ts), so it isn't enough to just check
// whether minGrade/maxGrade exist. Returns null (not false) when the session
// has no usable suggestion data at all, so callers can distinguish "checked,
// doesn't match" from "nothing to check" and fall back to the name heuristic.
function matchesSuggestionData(
  session: EventSession,
  profile: Pick<Profile, "academic_grade_value" | "date_of_birth">
): boolean | null {
  if (session.suggestionType === "grade" && session.minGrade !== undefined && session.maxGrade !== undefined) {
    if (profile.academic_grade_value === undefined) return false;
    return profile.academic_grade_value >= session.minGrade && profile.academic_grade_value <= session.maxGrade;
  }
  if (session.suggestionType === "age" && session.minAgeMonths !== undefined && session.maxAgeMonths !== undefined) {
    if (!profile.date_of_birth) return false;
    const months = calculateAgeInMonths(profile.date_of_birth);
    if (months === null) return false;
    return months >= session.minAgeMonths && months <= session.maxAgeMonths;
  }
  return null;
}

// The session whose real suggestion data (grade or age range) matches this
// child, or undefined if no child session has usable suggestion data (or
// none of them match) — callers fall back to pickSessionForGrade's
// name-text parsing in that case.
function pickSuggestedSession(
  sessions: EventSession[],
  profile: Pick<Profile, "academic_grade_value" | "date_of_birth">
): EventSession | undefined {
  return sessions.find((s) => s.type === "child" && matchesSuggestionData(s, profile) === true);
}

// The session to pre-select for a profile on the roster: for a child, the
// session whose real suggestion data matches (preferred) or whose name text
// implies the right grade range (fallback); otherwise the "General" session
// if the event has one.
export function defaultSessionForProfile(
  sessions: EventSession[],
  profile: Pick<Profile, "household_role" | "academic_grade_value" | "date_of_birth">
): EventSession | undefined {
  if (sessions.length === 0) return undefined;
  if (profile.household_role === "child") {
    const suggested = pickSuggestedSession(sessions, profile);
    if (suggested) return suggested;
    const matched = pickSessionForGrade(sessions, profile.academic_grade_value);
    if (matched) return matched;
  }
  const general = sessions.find((s) => s.type === "everyone") ?? sessions.find((s) => /general/i.test(s.name));
  return general ?? (sessions.length === 1 ? sessions[0] : undefined);
}
