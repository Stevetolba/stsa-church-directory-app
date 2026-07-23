import type { HouseholdAddress } from "./household";

// Mirrors Subsplash's latest-membership-status-change enum 1:1 — see ADR-0006.
export type MemberStatus =
  | "Visitor"
  | "Newcomer"
  | "Regular Attendee"
  | "Member"
  | "Former Attender";

export type Campus = "Arlington" | "Leesburg";

// Mirrors the "DirectoryRole" custom field's dropdown choices in Subsplash
// (ADR-0017) — lets a church admin elevate a personal-email person beyond
// the default volunteer tier without needing separate access to Subsplash's
// own admin UI: "Admin" grants full write access (same as being listed in
// ADMIN_EMAILS), "Team Lead" grants exactly one extra permission (sending
// the Children/Youth "Email Parents" feature). Unset, or "Volunteer", leaves
// someone exactly where the existing DirectoryAccess field already puts
// them — this field only ever elevates, never restricts.
export type DirectoryRole = "Admin" | "Team Lead" | "Volunteer";

// Mirrors Subsplash's HouseholdRole enum exactly (openapi.yaml) — not
// "head"/"spouse" as earlier mock data guessed before this was checked.
export type HouseholdRole = "guardian" | "parent" | "child" | "other" | "unknown";

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  emails?: string[];
  phone_number?: string;
  phones?: string[];
  date_of_birth?: string;
  gender?: string;
  marital_status?: string;
  household_id?: string;
  household_name?: string;
  household_role?: HouseholdRole;
  // Subsplash computes academic_grade server-side from graduation_year —
  // it isn't itself stored/editable. Only meaningful when household_role
  // is "child". academic_grade_value is Subsplash's numeric ordinal for
  // the same grade (see lib/grades.ts) — used for range filtering.
  academic_grade?: string;
  academic_grade_value?: number;
  graduation_year?: number;
  status: MemberStatus;
  campus?: Campus;
  // Whether this person's Subsplash profile has the DirectoryAccess custom
  // field set to an affirmative value — grants a personal-email volunteer
  // read-only sign-in (ADR-0010). Admin-editable from the person's edit
  // page, same as campus.
  directory_access?: boolean;
  // The DirectoryRole custom field's current value, if set (ADR-0017).
  // Admin-editable from the person's edit page, same as directory_access.
  directory_role?: DirectoryRole;
  // A profile can have its own linked address in Subsplash, independent of
  // the household's — most people don't have one set (the household address
  // is the norm), so display code should fall back to the household's.
  address?: string;
  address_parts?: HouseholdAddress;
  baptism_date?: string;
  // Free-text safety fields (ADR-0012). allergy_notes applies to anyone;
  // care_notes is flagged "private" in Subsplash and only populated for
  // child profiles.
  allergy_notes?: string;
  care_notes?: string;
  photo_url?: string;
  custom_fields?: CustomField[];
  created_at: string;
  updated_at: string;
}
