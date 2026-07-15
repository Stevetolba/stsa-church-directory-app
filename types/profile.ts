import type { HouseholdAddress } from "./household";

// Mirrors Subsplash's latest-membership-status-change enum 1:1 — see ADR-0006.
export type MemberStatus =
  | "Visitor"
  | "Newcomer"
  | "Regular Attendee"
  | "Member"
  | "Former Attender";

export type Campus = "Arlington" | "Leesburg";

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
