import { describe, expect, it } from "vitest";
import { HOUSEHOLD_EXPORT_COLUMNS, householdsToExportRows, toCsv } from "./csv";
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

describe("householdsToExportRows", () => {
  it("sorts households by name so rows group together", () => {
    const smith = household({
      id: "hh-smith",
      name: "Smith Household",
      members: [profile({ id: "j", first_name: "Jordan", last_name: "Smith" })],
    });
    const adams = household({
      id: "hh-adams",
      name: "Adams Household",
      members: [profile({ id: "a", first_name: "Alex", last_name: "Adams" })],
    });
    const rows = householdsToExportRows([smith, adams]);
    expect(rows.map((r) => r.household_name)).toEqual(["Adams Household", "Smith Household"]);
  });

  it("emits one row per member, repeating household fields", () => {
    const household1 = household({
      id: "hh-tolba",
      name: "Tolba Household",
      address: "1 Main St",
      members: [
        profile({ id: "steve", first_name: "Steve", last_name: "Tolba", household_role: "guardian" }),
        profile({
          id: "emily",
          first_name: "Emily",
          last_name: "Tolba",
          household_role: "child",
          academic_grade: "3rd Grade",
        }),
      ],
    });
    const rows = householdsToExportRows([household1]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      household_name: "Tolba Household",
      household_address: "1 Main St",
      member_first_name: "Steve",
      household_role: "guardian",
    });
    expect(rows[1]).toMatchObject({
      household_name: "Tolba Household",
      member_first_name: "Emily",
      household_role: "child",
      grade: "3rd Grade",
    });
  });

  it("still emits a row for a household with no members", () => {
    const empty = household({ id: "hh-empty", name: "Empty Household" });
    const rows = householdsToExportRows([empty]);
    expect(rows).toEqual([
      {
        household_name: "Empty Household",
        household_address: "",
        household_campus: "",
        member_first_name: "",
        member_last_name: "",
        household_role: "",
        status: "",
        grade: "",
        email: "",
        phone: "",
      },
    ]);
  });

  it("round-trips through toCsv with the household columns", () => {
    const single = household({
      id: "hh-tolba",
      name: "Tolba Household",
      members: [profile({ id: "steve", first_name: "Steve", last_name: "Tolba" })],
    });
    const csv = toCsv(householdsToExportRows([single]), HOUSEHOLD_EXPORT_COLUMNS);
    expect(csv.split("\r\n")[0]).toBe(
      "Household Name,Household Address,Household Campus,Member First Name,Member Last Name,Household Role,Status,Grade,Email,Phone"
    );
    expect(csv).toContain("Tolba Household");
    expect(csv).toContain("Steve");
  });
});
