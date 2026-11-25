import { describe, expect, it } from "vitest";
import {
  filterAndPaginateProfiles,
  sortAlphabetically,
  getVolunteerFieldOptions,
  mapProfile,
  updateProfile,
} from "./subsplash";
import { toCsv, VOLUNTEER_EXPORT_COLUMNS, volunteerToExportRow } from "./csv";
import { mockProfiles } from "./mockData";
import type { Profile } from "@/types/profile";
import type { VolunteerRow } from "@/types/volunteer";

function profile(overrides: Partial<Profile> & Pick<Profile, "id" | "first_name" | "last_name">): Profile {
  return {
    email: "",
    status: "Member",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const ALICE = profile({
  id: "alice",
  first_name: "Alice",
  last_name: "A",
  campus: "Arlington",
  campuses: ["Arlington"],
  teams: ["Welcome"],
  ministry_roles: ["Team Lead"],
});
const BOB = profile({
  id: "bob",
  first_name: "Bob",
  last_name: "B",
  campus: "Leesburg",
  campuses: ["Leesburg"],
  teams: ["Worship", "Welcome"],
  ministry_roles: ["Volunteer"],
});
// Belongs to both campuses — the campus filter must match on either.
const CARA = profile({
  id: "cara",
  first_name: "Cara",
  last_name: "C",
  campus: "Arlington",
  campuses: ["Arlington", "Leesburg"],
  teams: ["Worship"],
  ministry_roles: ["Volunteer"],
});
// Not a volunteer: no team, no role.
const DAN = profile({ id: "dan", first_name: "Dan", last_name: "D", campus: "Arlington", campuses: ["Arlington"] });
const ALL = [ALICE, BOB, CARA, DAN];

function ids(result: { profiles: Profile[] }) {
  return result.profiles.map((p) => p.id).sort();
}

describe("mapProfile — Ministry / Ministry Role", () => {
  const raw = {
    id: "p1",
    first_name: "Pat",
    last_name: "Lee",
    email: "pat@example.com",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    custom_fields: [
      {
        custom_field_definition: { id: "d1", name: "Ministry", type: "checkbox" },
        value: { choices: [{ id: "c1", name: "Welcome" }, { id: "c2", name: "Worship" }] },
      },
      {
        custom_field_definition: { id: "d2", name: " ministry role ", type: "checkbox" },
        value: { choices: [{ id: "c3", name: "Team Lead" }] },
      },
    ],
  };

  it("reads multi-select choices from both fields, case/space-insensitively", () => {
    const p = mapProfile(raw);
    expect(p.teams).toEqual(["Welcome", "Worship"]);
    expect(p.ministry_roles).toEqual(["Team Lead"]);
  });

  it("returns empty arrays when the fields are absent", () => {
    const p = mapProfile({ ...raw, custom_fields: [] });
    expect(p.teams).toEqual([]);
    expect(p.ministry_roles).toEqual([]);
  });
});

describe("filterAndPaginateProfiles — volunteer roster filters", () => {
  it("volunteersOnly keeps only people with a team or role", () => {
    expect(ids(filterAndPaginateProfiles(ALL, { volunteersOnly: true }))).toEqual(["alice", "bob", "cara"]);
  });

  it("filters by team (match any selected)", () => {
    expect(ids(filterAndPaginateProfiles(ALL, { teams: ["Worship"] }))).toEqual(["bob", "cara"]);
    expect(ids(filterAndPaginateProfiles(ALL, { teams: ["Worship", "Welcome"] }))).toEqual([
      "alice",
      "bob",
      "cara",
    ]);
  });

  it("filters by role", () => {
    expect(ids(filterAndPaginateProfiles(ALL, { ministryRoles: ["Team Lead"] }))).toEqual(["alice"]);
  });

  it("combines campus, team and role — all filters must match", () => {
    expect(
      ids(filterAndPaginateProfiles(ALL, { campus: ["Leesburg"], teams: ["Worship"], ministryRoles: ["Volunteer"] }))
    ).toEqual(["bob", "cara"]);
    expect(ids(filterAndPaginateProfiles(ALL, { campus: ["Arlington"], ministryRoles: ["Team Lead"] }))).toEqual([
      "alice",
    ]);
  });

  it("matches a two-campus person on either campus", () => {
    expect(ids(filterAndPaginateProfiles(ALL, { campus: ["Leesburg"], volunteersOnly: true }))).toEqual([
      "bob",
      "cara",
    ]);
  });
});

describe("updateProfile — teams / ministry_roles (mock mode)", () => {
  it("sets and then clears both fields", async () => {
    const target = mockProfiles.find((p) => p.id === "profile-evelyn-carter")!;
    expect(target.teams ?? []).toEqual([]);

    await updateProfile(target.id, { teams: ["Welcome"], ministry_roles: ["Greeter", "Volunteer"] });
    expect(target.teams).toEqual(["Welcome"]);
    expect(target.ministry_roles).toEqual(["Greeter", "Volunteer"]);
    expect(target.custom_fields?.find((f) => f.label === "Ministry Role")?.value).toBe("Greeter, Volunteer");

    // Removing a volunteer resets both fields.
    await updateProfile(target.id, { teams: [], ministry_roles: [] });
    expect(target.teams).toEqual([]);
    expect(target.ministry_roles).toEqual([]);
  });
});

describe("getVolunteerFieldOptions (mock mode)", () => {
  it("returns sorted, de-duplicated teams and roles", async () => {
    const { teams, roles } = await getVolunteerFieldOptions();
    expect(teams).toEqual(sortAlphabetically(teams));
    expect(teams).toContain("Welcome");
    expect(roles).toContain("Team Lead");
    expect(new Set(roles).size).toBe(roles.length);
  });
});

describe("volunteer CSV export", () => {
  const row: VolunteerRow = {
    id: "v1",
    first_name: "Pat",
    last_name: "Lee",
    email: "pat@example.com",
    phone_number: "(555) 111-2222",
    status: "Member",
    campuses: ["Arlington", "Leesburg"],
    teams: ["Welcome", "Children's, Youth"],
    ministry_roles: ["Team Lead"],
  };

  it("joins multiple values and includes teams and roles", () => {
    const out = volunteerToExportRow(row);
    expect(out.campus).toBe("Arlington; Leesburg");
    expect(out.teams).toBe("Welcome; Children's, Youth");
    expect(out.roles).toBe("Team Lead");
  });

  it("quotes cells that contain commas", () => {
    const csv = toCsv([volunteerToExportRow(row)], VOLUNTEER_EXPORT_COLUMNS);
    const [header, line] = csv.split("\r\n");
    expect(header).toBe("First Name,Last Name,Email,Phone,Campus,Teams,Roles,Status");
    expect(line).toContain('"Welcome; Children\'s, Youth"');
  });
});

describe("sortAlphabetically", () => {
  it("sorts case-insensitively and de-duplicates a Set", () => {
    expect(sortAlphabetically(new Set(["worship", "AV/Recording Team", "AFC", "Men's Ministry"]))).toEqual([
      "AFC",
      "AV/Recording Team",
      "Men's Ministry",
      "worship",
    ]);
  });
});
