import { describe, expect, it } from "vitest";
import { filterAndPaginateHouseholds } from "./subsplash";
import type { Household } from "@/types/household";
import type { Profile } from "@/types/profile";

function profile(overrides: Partial<Profile> & Pick<Profile, "id" | "first_name" | "last_name">): Profile {
  return {
    email: "",
    status: "Member",
    household_role: "parent",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function household(overrides: Partial<Household> & Pick<Household, "id" | "name">): Household {
  return {
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

// The Tolba household: two guardians (one Arlington, one Member status) plus
// a 3rd-grade child.
const TOLBA_PARENT = profile({
  id: "steve",
  first_name: "Steve",
  last_name: "Tolba",
  household_role: "guardian",
  campus: "Arlington",
  status: "Member",
});
const TOLBA_CHILD = profile({
  id: "emily",
  first_name: "Emily",
  last_name: "Tolba",
  household_role: "child",
  campus: "Arlington",
  status: "Member",
  academic_grade_value: 5,
});
const TOLBA = household({
  id: "hh-tolba",
  name: "Tolba Household",
  address: "1 Main St",
  members: [TOLBA_PARENT, TOLBA_CHILD],
});

// The Smith household: a single Leesburg guardian, no children at all.
const SMITH_PARENT = profile({
  id: "jordan",
  first_name: "Jordan",
  last_name: "Smith",
  household_role: "guardian",
  campus: "Leesburg",
  status: "Regular Attendee",
});
const SMITH = household({
  id: "hh-smith",
  name: "Smith Household",
  address: "2 Oak Ave",
  members: [SMITH_PARENT],
});

const ALL = [TOLBA, SMITH];

describe("filterAndPaginateHouseholds", () => {
  it("with no params, returns every household", () => {
    const result = filterAndPaginateHouseholds(ALL, {});
    expect(result.households.map((h) => h.id).sort()).toEqual(["hh-smith", "hh-tolba"]);
    expect(result.total).toBe(2);
    expect(result.overallTotal).toBe(2);
  });

  it("filters by search across name and address", () => {
    expect(filterAndPaginateHouseholds(ALL, { search: "smith" }).households.map((h) => h.id)).toEqual([
      "hh-smith",
    ]);
    expect(filterAndPaginateHouseholds(ALL, { search: "Oak Ave" }).households.map((h) => h.id)).toEqual([
      "hh-smith",
    ]);
  });

  it("filters by campus, derived from the representative guardian/parent member", () => {
    expect(filterAndPaginateHouseholds(ALL, { campus: ["Leesburg"] }).households.map((h) => h.id)).toEqual([
      "hh-smith",
    ]);
    expect(filterAndPaginateHouseholds(ALL, { campus: ["Arlington"] }).households.map((h) => h.id)).toEqual([
      "hh-tolba",
    ]);
  });

  it("filters by member status — matches if any member has that status", () => {
    expect(
      filterAndPaginateHouseholds(ALL, { status: ["Regular Attendee"] }).households.map((h) => h.id)
    ).toEqual(["hh-smith"]);
  });

  it("filters by grade range — matches if any member's grade falls in range", () => {
    expect(
      filterAndPaginateHouseholds(ALL, { gradeFrom: 4, gradeTo: 6 }).households.map((h) => h.id)
    ).toEqual(["hh-tolba"]);
    expect(filterAndPaginateHouseholds(ALL, { gradeFrom: 10, gradeTo: 14 }).households).toEqual([]);
  });

  it('childrenMode "without" returns only households with no child member', () => {
    expect(
      filterAndPaginateHouseholds(ALL, { childrenMode: "without" }).households.map((h) => h.id)
    ).toEqual(["hh-smith"]);
  });

  it('childrenMode "with" returns only households with at least one child member', () => {
    expect(filterAndPaginateHouseholds(ALL, { childrenMode: "with" }).households.map((h) => h.id)).toEqual([
      "hh-tolba",
    ]);
  });

  it("a household with no members at all counts as having no children", () => {
    const empty = household({ id: "hh-empty", name: "Empty Household" });
    const result = filterAndPaginateHouseholds([...ALL, empty], { childrenMode: "without" });
    expect(result.households.map((h) => h.id).sort()).toEqual(["hh-empty", "hh-smith"]);
  });

  it("combines multiple filters (AND semantics)", () => {
    const result = filterAndPaginateHouseholds(ALL, { campus: ["Arlington"], childrenMode: "with" });
    expect(result.households.map((h) => h.id)).toEqual(["hh-tolba"]);
  });
});
