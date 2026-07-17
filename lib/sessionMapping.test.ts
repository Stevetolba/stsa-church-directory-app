import { describe, expect, it } from "vitest";
import { defaultSessionForProfile, pickSessionForGrade } from "./sessionMapping";
import type { EventSession } from "@/types/event";

const SESSIONS: EventSession[] = [
  { id: "prek", name: "Pre-K", type: "child" },
  { id: "1-5", name: "Grades 1–5", type: "child" },
  { id: "youth", name: "Youth (6–12)", type: "child" },
];

// Grade values per lib/grades.ts: Pre-K=1, K=2, 1st=3 … 12th=14.
describe("pickSessionForGrade", () => {
  it("maps Pre-K", () => {
    expect(pickSessionForGrade(SESSIONS, 1)?.id).toBe("prek");
  });
  it("maps 3rd grade (value 5) to Grades 1–5", () => {
    expect(pickSessionForGrade(SESSIONS, 5)?.id).toBe("1-5");
  });
  it("maps 8th grade (value 10) to Youth (6–12)", () => {
    expect(pickSessionForGrade(SESSIONS, 10)?.id).toBe("youth");
  });
  it("returns undefined for an undefined grade", () => {
    expect(pickSessionForGrade(SESSIONS, undefined)).toBeUndefined();
  });
});

describe("defaultSessionForProfile", () => {
  it("picks the grade session for a child", () => {
    const s = defaultSessionForProfile(SESSIONS, {
      household_role: "child",
      academic_grade_value: 5,
    });
    expect(s?.id).toBe("1-5");
  });

  it("picks General for an adult when present", () => {
    const withGeneral: EventSession[] = [{ id: "gen", name: "General", type: "everyone" }, ...SESSIONS];
    const s = defaultSessionForProfile(withGeneral, {
      household_role: "guardian",
      academic_grade_value: undefined,
    });
    expect(s?.id).toBe("gen");
  });

  it("returns undefined when there are no sessions", () => {
    expect(
      defaultSessionForProfile([], { household_role: "child", academic_grade_value: 5 })
    ).toBeUndefined();
  });
});

describe("parseSessionRange via pickSessionForGrade — type is ground truth over name text", () => {
  it("ignores a child-grade-shaped name when type isn't child", () => {
    // Name text alone would parse as a 1st-5th grade range; type says otherwise.
    const sessions: EventSession[] = [{ id: "trap", name: "Grades 1-5 Volunteer Training", type: "adult" }];
    expect(pickSessionForGrade(sessions, 5)).toBeUndefined();
  });
});

// Mirrors the real "Sunday School [Leesburg]" sessions (confirmed live):
// grade values share Profile.academic_grade_value's exact scale, ages are in
// months. "LB (Pre-K-5yrs)" carries a stray minGrade even though
// suggestionType is "age" — real data, not a hypothetical.
const REAL_SESSIONS: EventSession[] = [
  { id: "prek", name: "LB (Pre-K-5yrs) Tim's Tots", type: "child", suggestionType: "age", minGrade: 1, minAgeMonths: 36, maxAgeMonths: 71 },
  { id: "k-2", name: "LB (K-2nd) Kids At The Well", type: "child", suggestionType: "grade", minGrade: 2, maxGrade: 4 },
  { id: "3-5", name: "LB (3rd-5th) Kids At The Well", type: "child", suggestionType: "grade", minGrade: 5, maxGrade: 7 },
  { id: "none", name: "LB (4th-5th) Odd One Out", type: "child", suggestionType: "none", minGrade: 1 },
];

describe("defaultSessionForProfile — real suggestion data takes priority over name text", () => {
  it("matches by grade range when suggestionType is 'grade'", () => {
    const s = defaultSessionForProfile(REAL_SESSIONS, {
      household_role: "child",
      academic_grade_value: 4, // 2nd grade
      date_of_birth: undefined,
    });
    expect(s?.id).toBe("k-2");
  });

  it("matches by age-in-months when suggestionType is 'age', ignoring the stray minGrade", () => {
    // 4 years old exactly, computed relative to the actual run date rather
    // than hardcoded, so this doesn't go flaky as real time passes — lands
    // at 48 completed months, safely inside prek's 36–71 range.
    const now = new Date();
    const fourYearsAgo = new Date(now.getFullYear() - 4, now.getMonth(), now.getDate());
    // Grade value (undefined) alone would never match "k-2" (2-4) or "3-5"
    // (5-7); the session must be picked by age, not by its stray minGrade: 1.
    const s = defaultSessionForProfile(REAL_SESSIONS, {
      household_role: "child",
      academic_grade_value: undefined,
      date_of_birth: fourYearsAgo.toISOString().slice(0, 10),
    });
    expect(s?.id).toBe("prek");
  });

  it("falls through to name-text parsing when suggestionType is 'none'", () => {
    // "none" sessions can't be matched by suggestion data even with a
    // populated minGrade — pickSessionForGrade's name parsing is the only
    // path, and "Odd One Out" doesn't parse to anything, so nothing matches.
    const s = defaultSessionForProfile(REAL_SESSIONS, {
      household_role: "child",
      academic_grade_value: 1, // minGrade: 1 on the "none" session must NOT match this
      date_of_birth: undefined,
    });
    expect(s?.id).not.toBe("none");
  });

  it("returns undefined for a grade session when the profile has no grade", () => {
    const s = defaultSessionForProfile(REAL_SESSIONS, {
      household_role: "child",
      academic_grade_value: undefined,
      date_of_birth: undefined,
    });
    expect(s).toBeUndefined();
  });
});
