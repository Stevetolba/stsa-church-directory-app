import type { Profile } from "@/types/profile";
import type { Household } from "@/types/household";

// Mock fixtures — Step 3 build order: "mock responses until credentials
// arrive". Extends the design mockup's 9 sample members with the full
// Profile shape, one household per member (plus one two-member household
// to exercise the "other household members" list), and all five
// MemberStatus values represented (ADR-0006). Arlington and Leesburg are
// both real Northern Virginia towns, so addresses use VA.

// Stored on globalThis rather than as plain module-level consts: Next.js's
// dev server compiles Route Handlers and Server Components as separate
// module layers, so a plain array here would be a *different* array in
// each — mutations from updateProfile() (called from the API route) would
// be invisible to pages reading it back. globalThis is a true singleton
// across all layers within the same process (the same reasoning as the
// standard Next.js Prisma-client-singleton pattern for surviving Fast
// Refresh). Irrelevant once wired to the real API — a real HTTP call has
// no such problem.
declare global {
  // eslint-disable-next-line no-var
  var __mockHouseholds: Household[] | undefined;
  // eslint-disable-next-line no-var
  var __mockProfiles: Profile[] | undefined;
}

const SEED_HOUSEHOLDS: Household[] = [
  {
    id: "household-whitfield",
    name: "Whitfield Family",
    primary_email: "margaret.whitfield@gracechapel.org",
    primary_phone: "(614) 555-0142",
    address: "142 Maple Street, Arlington, VA 22201",
    status: "active",
    created_at: "2019-03-11T14:00:00Z",
    updated_at: "2025-11-02T09:30:00Z",
  },
  {
    id: "household-okafor",
    name: "Okafor Household",
    primary_email: "d.okafor@gracechapel.org",
    primary_phone: "(614) 555-0198",
    address: "88 Cardinal Lane, Leesburg, VA 20175",
    status: "active",
    created_at: "2020-06-04T14:00:00Z",
    updated_at: "2025-10-18T09:30:00Z",
  },
  {
    id: "household-anand",
    name: "Anand Family",
    primary_email: "priya.anand@gmail.com",
    primary_phone: "(614) 555-0173",
    address: "27 Birchwood Court, Arlington, VA 22203",
    status: "active",
    created_at: "2021-01-22T14:00:00Z",
    updated_at: "2025-09-30T09:30:00Z",
  },
  {
    id: "household-reyes",
    name: "Reyes Household",
    primary_email: "treyes88@outlook.com",
    primary_phone: "(614) 555-0110",
    address: "510 Harrison Ave, Leesburg, VA 20176",
    status: "active",
    created_at: "2024-12-01T14:00:00Z",
    updated_at: "2025-12-01T09:30:00Z",
  },
  {
    id: "household-carter",
    name: "Carter Family",
    primary_email: "evelyn.carter@gracechapel.org",
    primary_phone: "(614) 555-0161",
    address: "9 Fairview Terrace, Arlington, VA 22204",
    status: "active",
    created_at: "2017-08-19T14:00:00Z",
    updated_at: "2025-11-20T09:30:00Z",
  },
  {
    id: "household-sutton",
    name: "Sutton Household",
    primary_email: "j.sutton@yahoo.com",
    primary_phone: "(614) 555-0129",
    address: "233 King Street, Leesburg, VA 20175",
    status: "active",
    created_at: "2026-02-09T14:00:00Z",
    updated_at: "2026-02-09T09:30:00Z",
  },
  {
    id: "household-morales",
    name: "Morales Family",
    primary_email: "ana.morales@gmail.com",
    primary_phone: "(614) 555-0184",
    address: "76 Wilson Blvd, Arlington, VA 22201",
    status: "active",
    created_at: "2025-05-14T14:00:00Z",
    updated_at: "2025-12-15T09:30:00Z",
  },
  {
    id: "household-bishop",
    name: "Bishop Household",
    primary_email: "h.bishop@gracechapel.org",
    primary_phone: "(614) 555-0155",
    address: "14 Loudoun St, Leesburg, VA 20176",
    status: "active",
    created_at: "2015-04-02T14:00:00Z",
    updated_at: "2024-06-10T09:30:00Z",
  },
  {
    id: "household-fields",
    name: "Fields Family",
    primary_email: "naomi.fields@gmail.com",
    primary_phone: "(614) 555-0137",
    address: "301 Clarendon Blvd, Arlington, VA 22203",
    status: "active",
    created_at: "2022-09-27T14:00:00Z",
    updated_at: "2025-08-05T09:30:00Z",
  },
];

const SEED_PROFILES: Profile[] = [
  {
    id: "profile-margaret-whitfield",
    first_name: "Margaret",
    last_name: "Whitfield",
    email: "margaret.whitfield@gracechapel.org",
    phone_number: "(614) 555-0142",
    date_of_birth: "1968-04-12",
    gender: "female",
    marital_status: "married",
    household_id: "household-whitfield",
    household_name: "Whitfield Family",
    household_role: "parent",
    status: "Member",
    campus: "Arlington",
    baptism_date: "1985-06-02",
    // allergy_notes applies to any profile (not just children); no care_notes
    // here so the adult-vs-child rendering (Care shown only for children) is
    // exercisable in mock mode — ADR-0012.
    allergy_notes: "Latex allergy.",
    // Directory access flags this person as an approved read-only volunteer
    // (ADR-0010) — lets the volunteer sign-in path be exercised in mock mode.
    // Field label matches this project's configured
    // SUBSPLASH_ACCESS_FIELD_NAME (.env.local), not the code's fallback default.
    custom_fields: [
      { id: "cf-campus", label: "Campus", value: "Arlington" },
      { id: "cf-access", label: "DirectoryAccess", value: "Yes" },
    ],
    created_at: "2019-03-11T14:00:00Z",
    updated_at: "2025-11-02T09:30:00Z",
  },
  {
    id: "profile-robert-whitfield",
    first_name: "Robert",
    last_name: "Whitfield",
    email: "robert.whitfield@gracechapel.org",
    phone_number: "(614) 555-0143",
    date_of_birth: "1966-09-21",
    gender: "male",
    marital_status: "married",
    household_id: "household-whitfield",
    household_name: "Whitfield Family",
    household_role: "parent",
    status: "Member",
    campus: "Arlington",
    baptism_date: "1983-05-15",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2019-03-11T14:00:00Z",
    updated_at: "2025-11-02T09:30:00Z",
  },
  {
    id: "profile-lily-whitfield",
    first_name: "Lily",
    last_name: "Whitfield",
    email: "lily.whitfield@gracechapel.org",
    date_of_birth: "2016-03-08",
    gender: "female",
    household_id: "household-whitfield",
    household_name: "Whitfield Family",
    household_role: "child",
    // academic_grade is normally computed server-side by Subsplash from
    // graduation_year — hardcoded here as a mock stand-in for that.
    // academic_grade_value follows Subsplash's real ordinal scale
    // (lib/grades.ts): 5th Grade = 7.
    graduation_year: 2034,
    academic_grade: "5th Grade",
    academic_grade_value: 7,
    status: "Member",
    campus: "Arlington",
    baptism_date: "2016-08-21",
    // Safety fields (ADR-0012) — care_notes is child-only + "private".
    allergy_notes: "Severe peanut allergy — carries an EpiPen.",
    care_notes: "Needs quiet space if overstimulated. Pickup by parent or grandmother only.",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2019-03-11T14:00:00Z",
    updated_at: "2025-11-02T09:30:00Z",
  },
  {
    id: "profile-daniel-okafor",
    first_name: "Daniel",
    last_name: "Okafor",
    email: "d.okafor@gracechapel.org",
    phone_number: "(614) 555-0198",
    date_of_birth: "1979-11-03",
    gender: "male",
    marital_status: "married",
    household_id: "household-okafor",
    household_name: "Okafor Household",
    household_role: "guardian",
    status: "Member",
    campus: "Leesburg",
    baptism_date: "2001-09-16",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Leesburg" }],
    created_at: "2020-06-04T14:00:00Z",
    updated_at: "2025-10-18T09:30:00Z",
  },
  {
    id: "profile-priya-anand",
    first_name: "Priya",
    last_name: "Anand",
    email: "priya.anand@gmail.com",
    phone_number: "(614) 555-0173",
    date_of_birth: "1990-02-27",
    gender: "female",
    marital_status: "single",
    household_id: "household-anand",
    household_name: "Anand Family",
    household_role: "guardian",
    status: "Regular Attendee",
    campus: "Arlington",
    // Personal gmail address + directory access: exercises the volunteer
    // sign-in path (ADR-0010) against mock data — Priya isn't on the church
    // Workspace domain but is an approved volunteer. Field label matches
    // this project's configured SUBSPLASH_ACCESS_FIELD_NAME (.env.local),
    // not necessarily the code's fallback default.
    custom_fields: [
      { id: "cf-campus", label: "Campus", value: "Arlington" },
      { id: "cf-directory-access", label: "DirectoryAccess", value: "Yes" },
    ],
    created_at: "2021-01-22T14:00:00Z",
    updated_at: "2025-09-30T09:30:00Z",
  },
  {
    id: "profile-thomas-reyes",
    first_name: "Thomas",
    last_name: "Reyes",
    email: "treyes88@outlook.com",
    phone_number: "(614) 555-0110",
    date_of_birth: "1988-07-19",
    gender: "male",
    household_id: "household-reyes",
    household_name: "Reyes Household",
    household_role: "guardian",
    status: "Visitor",
    campus: "Leesburg",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Leesburg" }],
    created_at: "2024-12-01T14:00:00Z",
    updated_at: "2025-12-01T09:30:00Z",
  },
  {
    id: "profile-evelyn-carter",
    first_name: "Evelyn",
    last_name: "Carter",
    email: "evelyn.carter@gracechapel.org",
    phone_number: "(614) 555-0161",
    date_of_birth: "1957-01-30",
    gender: "female",
    marital_status: "widowed",
    household_id: "household-carter",
    household_name: "Carter Family",
    household_role: "guardian",
    status: "Member",
    campus: "Arlington",
    baptism_date: "1973-04-08",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2017-08-19T14:00:00Z",
    updated_at: "2025-11-20T09:30:00Z",
  },
  {
    id: "profile-james-sutton",
    first_name: "James",
    last_name: "Sutton",
    email: "j.sutton@yahoo.com",
    phone_number: "(614) 555-0129",
    date_of_birth: "1995-09-05",
    gender: "male",
    household_id: "household-sutton",
    household_name: "Sutton Household",
    household_role: "guardian",
    status: "Newcomer",
    campus: "Leesburg",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Leesburg" }],
    created_at: "2026-02-09T14:00:00Z",
    updated_at: "2026-02-09T09:30:00Z",
  },
  {
    id: "profile-ana-morales",
    first_name: "Ana",
    last_name: "Morales",
    email: "ana.morales@gmail.com",
    phone_number: "(614) 555-0184",
    date_of_birth: "2001-12-14",
    gender: "female",
    marital_status: "single",
    household_id: "household-morales",
    household_name: "Morales Family",
    household_role: "guardian",
    status: "Visitor",
    campus: "Arlington",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2025-05-14T14:00:00Z",
    updated_at: "2025-12-15T09:30:00Z",
  },
  {
    id: "profile-harold-bishop",
    first_name: "Harold",
    last_name: "Bishop",
    email: "h.bishop@gracechapel.org",
    phone_number: "(614) 555-0155",
    date_of_birth: "1949-05-22",
    gender: "male",
    marital_status: "widowed",
    household_id: "household-bishop",
    household_name: "Bishop Household",
    household_role: "guardian",
    status: "Former Attender",
    campus: "Leesburg",
    baptism_date: "1966-08-14",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Leesburg" }],
    created_at: "2015-04-02T14:00:00Z",
    updated_at: "2024-06-10T09:30:00Z",
  },
  {
    id: "profile-naomi-fields",
    first_name: "Naomi",
    last_name: "Fields",
    email: "naomi.fields@gmail.com",
    phone_number: "(614) 555-0137",
    date_of_birth: "1993-10-08",
    gender: "female",
    marital_status: "married",
    household_id: "household-fields",
    household_name: "Fields Family",
    household_role: "guardian",
    status: "Regular Attendee",
    campus: "Arlington",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2022-09-27T14:00:00Z",
    updated_at: "2025-08-05T09:30:00Z",
  },
];

export const mockHouseholds = globalThis.__mockHouseholds ?? (globalThis.__mockHouseholds = SEED_HOUSEHOLDS);
export const mockProfiles = globalThis.__mockProfiles ?? (globalThis.__mockProfiles = SEED_PROFILES);
