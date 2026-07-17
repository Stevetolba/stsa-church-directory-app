import { describe, expect, it } from "vitest";
import { calculateAgeInMonths } from "./age";

// new Date("YYYY-MM-DD") parses as UTC midnight, which calculateAgeInMonths'
// local getMonth()/getDate() reads back a day early in negative-UTC-offset
// zones (the exact pitfall lib/age.ts's own parseIsoDateParts comment warns
// about) — asOf below uses the local-time Date(y, m, d) constructor instead.
describe("calculateAgeInMonths", () => {
  it("counts whole months, not rounding up before the day-of-month is reached", () => {
    // Born the 15th; as of the 10th of the same later month, that month
    // hasn't completed yet.
    expect(calculateAgeInMonths("2023-01-15", new Date(2023, 3, 10))).toBe(2);
    // As of the 15th or later, the month has completed.
    expect(calculateAgeInMonths("2023-01-15", new Date(2023, 3, 15))).toBe(3);
    expect(calculateAgeInMonths("2023-01-15", new Date(2023, 3, 20))).toBe(3);
  });

  it("matches the real Subsplash 'Pre-K-5yrs' session range (36–71 months)", () => {
    // Exactly 3 years old.
    expect(calculateAgeInMonths("2020-06-01", new Date(2023, 5, 1))).toBe(36);
    // Just under 6 years old.
    expect(calculateAgeInMonths("2017-07-01", new Date(2023, 5, 1))).toBe(71);
  });

  it("handles a year boundary", () => {
    expect(calculateAgeInMonths("2022-11-01", new Date(2023, 0, 1))).toBe(2);
  });

  it("returns null for an unparseable or missing date of birth", () => {
    expect(calculateAgeInMonths("")).toBeNull();
    expect(calculateAgeInMonths("not-a-date")).toBeNull();
  });
});
