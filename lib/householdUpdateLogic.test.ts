import { describe, expect, it } from "vitest";
import {
  buildAddressChanges,
  buildNewMemberChanges,
  buildProfileChanges,
  displayValue,
  findDuplicateCandidates,
  hasDrifted,
  isValidIsoDate,
} from "./householdUpdateLogic";
import { gradeValueForGraduationYear, graduationYearForGradeValue } from "./grades";

const NOV_2026 = new Date("2026-11-04T12:00:00Z"); // school year ends 2027
const JUN_2026 = new Date("2026-06-15T12:00:00Z"); // school year ends 2026

describe("grade <-> graduation year", () => {
  it("12th grade graduates at the end of the current school year", () => {
    expect(graduationYearForGradeValue(14, NOV_2026)).toBe(2027);
    expect(graduationYearForGradeValue(14, JUN_2026)).toBe(2026);
  });
  it("maps Pre-K, K and 1st correctly", () => {
    expect(graduationYearForGradeValue(1, NOV_2026)).toBe(2027 + 13); // Pre-K
    expect(graduationYearForGradeValue(2, NOV_2026)).toBe(2027 + 12); // K
    expect(graduationYearForGradeValue(3, NOV_2026)).toBe(2027 + 11); // 1st
  });
  it("round-trips every grade", () => {
    for (let v = 1; v <= 14; v++) {
      expect(gradeValueForGraduationYear(graduationYearForGradeValue(v, NOV_2026)!, NOV_2026)).toBe(v);
    }
  });
  it("rejects values off the scale", () => {
    expect(graduationYearForGradeValue(0, NOV_2026)).toBeUndefined();
    expect(graduationYearForGradeValue(15, NOV_2026)).toBeUndefined();
    expect(gradeValueForGraduationYear(2050, NOV_2026)).toBeUndefined();
  });
});

describe("buildProfileChanges", () => {
  const current = { first_name: "Sam", last_name: "Lee", date_of_birth: "2015-03-02", graduation_year: 2031, academic_grade_value: 10 };

  it("returns nothing when values are unchanged", () => {
    const r = buildProfileChanges(current, { first_name: " Sam ", last_name: "Lee", date_of_birth: "2015-03-02", grade_value: 10 }, { isChild: true, now: NOV_2026 });
    expect(r.errors).toEqual({});
    expect(r.changes).toEqual([]);
  });

  it("returns only the fields that differ", () => {
    const r = buildProfileChanges(current, { first_name: "Samuel", last_name: "Lee", date_of_birth: "2015-03-02" }, { isChild: true, now: NOV_2026 });
    expect(r.changes).toEqual([{ field: "first_name", oldValue: "Sam", newValue: "Samuel" }]);
  });

  it("stores a grade change as a graduation year", () => {
    const r = buildProfileChanges(current, { first_name: "Sam", last_name: "Lee", grade_value: 8 }, { isChild: true, now: NOV_2026 });
    expect(r.changes).toEqual([{ field: "graduation_year", oldValue: "2031", newValue: String(2027 + 12 - 6) }]);
  });

  it("ignores grade for adults", () => {
    const r = buildProfileChanges({ first_name: "Ann", last_name: "Lee" }, { first_name: "Ann", last_name: "Lee", grade_value: 8 }, { isChild: false, now: NOV_2026 });
    expect(r.changes).toEqual([]);
  });

  it("never clears a date of birth", () => {
    const r = buildProfileChanges(current, { first_name: "Sam", last_name: "Lee", date_of_birth: "" }, { isChild: true, now: NOV_2026 });
    expect(r.changes).toEqual([]);
  });

  it("validates names, dates and grade", () => {
    const r = buildProfileChanges(current, { first_name: " ", last_name: "Lee", date_of_birth: "2999-01-01", grade_value: 99 }, { isChild: true, now: NOV_2026 });
    expect(Object.keys(r.errors).sort()).toEqual(["date_of_birth", "first_name", "grade_value"]);
    expect(r.changes).toEqual([]);
  });
});

describe("buildAddressChanges", () => {
  const current = { street: "1 Main St", city: "Arlington", state: "VA", postal_code: "22201" };
  it("keeps only changed address parts", () => {
    const r = buildAddressChanges(current, { ...current, street: "2 Oak Ave", postal_code: "22202" });
    expect(r.changes.map((c) => c.field)).toEqual(["street", "postal_code"]);
  });
  it("requires every part", () => {
    const r = buildAddressChanges(current, { ...current, city: "" });
    expect(r.errors.city).toBeTruthy();
  });
});

describe("buildNewMemberChanges", () => {
  it("builds additions for a child with a grade", () => {
    const r = buildNewMemberChanges({ first_name: "Eve", last_name: "Lee", role: "child", grade_value: 3 }, NOV_2026);
    expect(r.errors).toEqual({});
    expect(r.changes.map((c) => c.field)).toEqual(["first_name", "last_name", "household_role", "graduation_year"]);
    expect(r.changes.every((c) => c.oldValue === null)).toBe(true);
  });
  it("requires a birth date or grade for a child", () => {
    expect(buildNewMemberChanges({ first_name: "Eve", last_name: "Lee", role: "child" }, NOV_2026).errors.date_of_birth).toBeTruthy();
  });
  it("accepts an adult with just a name", () => {
    expect(buildNewMemberChanges({ first_name: "Al", last_name: "Lee", role: "guardian" }, NOV_2026).errors).toEqual({});
  });
});

describe("helpers", () => {
  it("validates ISO dates", () => {
    expect(isValidIsoDate("2020-02-29", NOV_2026)).toBe(true);
    expect(isValidIsoDate("2021-02-29", NOV_2026)).toBe(false);
    expect(isValidIsoDate("2027-01-01", NOV_2026)).toBe(false);
    expect(isValidIsoDate("03/02/2015", NOV_2026)).toBe(false);
  });
  it("detects drift ignoring whitespace and empties", () => {
    expect(hasDrifted("Sam", " Sam ")).toBe(false);
    expect(hasDrifted(null, "")).toBe(false);
    expect(hasDrifted("Sam", "Samuel")).toBe(true);
  });
  it("shows grade labels for graduation years", () => {
    expect(displayValue("graduation_year", "2027", NOV_2026)).toBe("12th Grade (class of 2027)");
    expect(displayValue("first_name", null)).toBe("—");
  });
  it("finds duplicate candidates by last name plus first name or DOB", () => {
    const roster = [
      { first_name: "Eve", last_name: "Lee", date_of_birth: "2018-01-01" },
      { first_name: "Zed", last_name: "Lee", date_of_birth: "2019-05-05" },
      { first_name: "Eve", last_name: "Kim", date_of_birth: "2018-01-01" },
    ];
    expect(findDuplicateCandidates({ first_name: "eve", last_name: "LEE" }, roster)).toHaveLength(1);
    expect(findDuplicateCandidates({ first_name: "Nia", last_name: "Lee", date_of_birth: "2019-05-05" }, roster)).toHaveLength(1);
  });
});
