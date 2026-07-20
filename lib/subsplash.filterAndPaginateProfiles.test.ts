import { describe, expect, it } from "vitest";
import { filterAndPaginateProfiles } from "./subsplash";
import type { Profile } from "@/types/profile";

function profile(overrides: Partial<Profile> & Pick<Profile, "id" | "first_name" | "last_name">): Profile {
  return {
    email: "",
    status: "Member",
    household_id: "hh-tolba",
    household_role: "parent",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

// One household: a parent whose own contact info is searched, plus two kids
// whose own name/email/phone don't contain the search text at all.
const STEVE = profile({
  id: "steve",
  first_name: "Steve",
  last_name: "Tolba",
  email: "swtolba@stsa.church",
  phone_number: "(215) 940-5960",
  household_role: "parent",
});
const EMILY = profile({ id: "emily", first_name: "Emily", last_name: "Tolba", household_role: "child" });
const LUKE = profile({ id: "luke", first_name: "Luke", last_name: "Tolba", household_role: "child" });
// A different household entirely — must never leak in.
const UNRELATED = profile({
  id: "unrelated",
  first_name: "Jordan",
  last_name: "Smith",
  household_id: "hh-smith",
  household_role: "parent",
});

const ALL = [STEVE, EMILY, LUKE, UNRELATED];

describe("filterAndPaginateProfiles — expandHouseholds", () => {
  it("without expandHouseholds, a parent-only search text excludes the kids", () => {
    const result = filterAndPaginateProfiles(ALL, { search: "Steve" });
    expect(result.profiles.map((p) => p.id)).toEqual(["steve"]);
  });

  it("with expandHouseholds, a search matching only the parent's name also returns the kids", () => {
    const result = filterAndPaginateProfiles(ALL, { search: "Steve", expandHouseholds: true });
    expect(result.profiles.map((p) => p.id).sort()).toEqual(["emily", "luke", "steve"]);
  });

  it("expands on an email match too, not just name", () => {
    const result = filterAndPaginateProfiles(ALL, { search: "swtolba@stsa.church", expandHouseholds: true });
    expect(result.profiles.map((p) => p.id).sort()).toEqual(["emily", "luke", "steve"]);
  });

  it("expands on a phone match, digits-only", () => {
    const result = filterAndPaginateProfiles(ALL, { search: "2159405960", expandHouseholds: true });
    expect(result.profiles.map((p) => p.id).sort()).toEqual(["emily", "luke", "steve"]);
  });

  it("never pulls in an unrelated household", () => {
    const result = filterAndPaginateProfiles(ALL, { search: "Steve", expandHouseholds: true });
    expect(result.profiles.map((p) => p.id)).not.toContain("unrelated");
  });

  it("expanded members still have to pass other active filters (e.g. status)", () => {
    const withdrawnKid = profile({
      id: "former",
      first_name: "Former",
      last_name: "Tolba",
      household_role: "child",
      status: "Former Attender",
    });
    const result = filterAndPaginateProfiles([...ALL, withdrawnKid], {
      search: "Steve",
      expandHouseholds: true,
      status: ["Member"],
    });
    expect(result.profiles.map((p) => p.id)).not.toContain("former");
  });

  it("does nothing when there's no search text (nothing to expand from)", () => {
    const result = filterAndPaginateProfiles(ALL, { expandHouseholds: true });
    expect(result.profiles).toHaveLength(4);
  });
});
