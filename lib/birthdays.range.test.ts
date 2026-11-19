import { describe, expect, it } from "vitest";
import { matchesBirthdayRange } from "./birthdays";

// Thursday, Nov 19 2026 — week is Sun Nov 15 – Sat Nov 21.
const today = new Date(2026, 10, 19);

describe("matchesBirthdayRange", () => {
  it("today", () => {
    expect(matchesBirthdayRange("1980-11-19", "today", today)).toBe(true);
    expect(matchesBirthdayRange("1980-11-20", "today", today)).toBe(false);
  });
  it("this week (Sun–Sat)", () => {
    expect(matchesBirthdayRange("1980-11-15", "this_week", today)).toBe(true);
    expect(matchesBirthdayRange("1980-11-21", "this_week", today)).toBe(true);
    expect(matchesBirthdayRange("1980-11-22", "this_week", today)).toBe(false);
    expect(matchesBirthdayRange("1980-11-14", "this_week", today)).toBe(false);
  });
  it("week straddling new year", () => {
    const dec30 = new Date(2026, 11, 30);
    expect(matchesBirthdayRange("1990-01-02", "this_week", dec30)).toBe(true);
  });
  it("this/next month, with December wrap", () => {
    expect(matchesBirthdayRange("1980-11-01", "this_month", today)).toBe(true);
    expect(matchesBirthdayRange("1980-12-01", "next_month", today)).toBe(true);
    expect(matchesBirthdayRange("1980-01-01", "next_month", new Date(2026, 11, 5))).toBe(true);
  });
  it("missing dob never matches", () => {
    expect(matchesBirthdayRange(undefined, "this_month", today)).toBe(false);
  });
});
