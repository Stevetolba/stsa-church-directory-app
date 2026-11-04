// Pure logic for the household self-update feature: validating what a parent
// typed, turning it into per-field changes against the current Subsplash
// values, and detecting drift at review time. No database or Subsplash calls
// here so it's cheap to test; storage lives in lib/householdUpdates.ts.

import { graduationYearForGradeValue, gradeLabelForValue, gradeValueForGraduationYear } from "./grades";

export type ProfileField = "first_name" | "last_name" | "date_of_birth" | "graduation_year";
export type AddressField = "street" | "city" | "state" | "postal_code";
export type NewMemberRole = "parent" | "guardian" | "child";
export type ChangeField = ProfileField | AddressField | "household_role";
export type SubjectType = "profile" | "household" | "new_member";

export const PROFILE_FIELDS: ProfileField[] = ["first_name", "last_name", "date_of_birth", "graduation_year"];
export const ADDRESS_FIELDS: AddressField[] = ["street", "city", "state", "postal_code"];

export const FIELD_LABELS: Record<ChangeField, string> = {
  first_name: "First name",
  last_name: "Last name",
  date_of_birth: "Date of birth",
  graduation_year: "Grade",
  street: "Street",
  city: "City",
  state: "State",
  postal_code: "ZIP code",
  household_role: "Role in household",
};

export interface ProposedChange {
  field: ChangeField;
  oldValue: string | null;
  newValue: string | null;
}

const norm = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim().replace(/\s+/g, " ");
  return t === "" ? null : t;
};

export function isValidIsoDate(value: string, today: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  if (value < "1900-01-01") return false;
  return value <= today.toISOString().slice(0, 10);
}

function validName(label: string, v: string | null, errors: Record<string, string>, key: string) {
  if (!v) errors[key] = `${label} is required.`;
  else if (v.length > 100) errors[key] = `${label} is too long.`;
}

export interface ProfileFormInput {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  // Subsplash academic_grade value (Pre-K=1 … 12th=14). Children only.
  grade_value?: number | null;
}

export interface ProfileCurrent {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  graduation_year?: number | null;
  academic_grade_value?: number | null;
}

export interface BuildResult {
  changes: ProposedChange[];
  errors: Record<string, string>;
}

// Compares what the parent submitted with what Subsplash has now and keeps
// only real differences, so re-saving untouched values (or typing a value
// back to the original) produces no change row.
export function buildProfileChanges(
  current: ProfileCurrent,
  input: ProfileFormInput,
  opts: { isChild: boolean; now?: Date }
): BuildResult {
  const now = opts.now ?? new Date();
  const errors: Record<string, string> = {};
  const changes: ProposedChange[] = [];

  const first = norm(input.first_name);
  const last = norm(input.last_name);
  validName("First name", first, errors, "first_name");
  validName("Last name", last, errors, "last_name");

  const dob = norm(input.date_of_birth ?? null);
  if (dob && !isValidIsoDate(dob, now)) errors.date_of_birth = "Enter a valid date of birth.";

  let gradYear: number | undefined;
  if (opts.isChild && input.grade_value != null) {
    gradYear = graduationYearForGradeValue(input.grade_value, now);
    if (gradYear === undefined) errors.grade_value = "Choose a grade from the list.";
  }
  if (Object.keys(errors).length > 0) return { changes: [], errors };

  const push = (field: ChangeField, oldV: string | null, newV: string | null) => {
    if (oldV !== newV) changes.push({ field, oldValue: oldV, newValue: newV });
  };
  push("first_name", norm(current.first_name), first);
  push("last_name", norm(current.last_name), last);
  // A parent can correct or fill in a birth date but not erase it.
  if (dob) push("date_of_birth", norm(current.date_of_birth ?? null), dob);
  if (opts.isChild && gradYear !== undefined && input.grade_value !== current.academic_grade_value) {
    push("graduation_year", current.graduation_year != null ? String(current.graduation_year) : null, String(gradYear));
  }
  return { changes, errors };
}

export interface AddressValues {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}

export function buildAddressChanges(current: AddressValues, input: AddressValues): BuildResult {
  const errors: Record<string, string> = {};
  const next: Record<AddressField, string | null> = {
    street: norm(input.street),
    city: norm(input.city),
    state: norm(input.state),
    postal_code: norm(input.postal_code),
  };
  if (!next.street) errors.street = "Street is required.";
  if (!next.city) errors.city = "City is required.";
  if (!next.state) errors.state = "State is required.";
  if (!next.postal_code) errors.postal_code = "ZIP code is required.";
  if (next.street && next.street.length > 200) errors.street = "Street is too long.";
  if (next.city && next.city.length > 100) errors.city = "City is too long.";
  if (next.state && next.state.length > 50) errors.state = "State is too long.";
  if (next.postal_code && !/^[A-Za-z0-9 -]{3,12}$/.test(next.postal_code)) errors.postal_code = "Enter a valid ZIP code.";
  if (Object.keys(errors).length > 0) return { changes: [], errors };

  const changes: ProposedChange[] = [];
  for (const f of ADDRESS_FIELDS) {
    const oldV = norm(current[f]);
    if (oldV !== next[f]) changes.push({ field: f, oldValue: oldV, newValue: next[f] });
  }
  return { changes, errors };
}

export interface NewMemberInput {
  first_name: string;
  last_name: string;
  role: NewMemberRole;
  date_of_birth?: string | null;
  grade_value?: number | null;
}

// A new member is all additions, so every provided field is a change from
// "nothing". Children need a birth date or a grade so the class lists work.
export function buildNewMemberChanges(input: NewMemberInput, now: Date = new Date()): BuildResult {
  const errors: Record<string, string> = {};
  const changes: ProposedChange[] = [];
  const first = norm(input.first_name);
  const last = norm(input.last_name);
  validName("First name", first, errors, "first_name");
  validName("Last name", last, errors, "last_name");
  if (!["parent", "guardian", "child"].includes(input.role)) errors.role = "Choose a role.";
  const dob = norm(input.date_of_birth ?? null);
  if (dob && !isValidIsoDate(dob, now)) errors.date_of_birth = "Enter a valid date of birth.";
  const isChild = input.role === "child";
  let gradYear: number | undefined;
  if (isChild && input.grade_value != null) {
    gradYear = graduationYearForGradeValue(input.grade_value, now);
    if (gradYear === undefined) errors.grade_value = "Choose a grade from the list.";
  }
  if (isChild && !dob && gradYear === undefined) errors.date_of_birth = "Enter a birth date or choose a grade.";
  if (Object.keys(errors).length > 0) return { changes: [], errors };

  changes.push({ field: "first_name", oldValue: null, newValue: first });
  changes.push({ field: "last_name", oldValue: null, newValue: last });
  changes.push({ field: "household_role", oldValue: null, newValue: input.role });
  if (dob) changes.push({ field: "date_of_birth", oldValue: null, newValue: dob });
  if (gradYear !== undefined) changes.push({ field: "graduation_year", oldValue: null, newValue: String(gradYear) });
  return { changes, errors };
}

// Review-time drift: the value Subsplash holds now differs from the value the
// household saw when they proposed the change.
export function hasDrifted(oldValue: string | null, liveValue: string | null): boolean {
  return norm(oldValue) !== norm(liveValue);
}

// Human-readable value for the review screens. graduation_year is shown as the
// grade it works out to (and the year, since that is what gets written).
export function displayValue(field: ChangeField, value: string | null, now: Date = new Date()): string {
  if (value == null || value === "") return "—";
  if (field === "graduation_year") {
    const year = Number(value);
    const grade = gradeLabelForValue(gradeValueForGraduationYear(year, now));
    return grade ? `${grade} (class of ${year})` : `Class of ${year}`;
  }
  if (field === "household_role") return value.charAt(0).toUpperCase() + value.slice(1);
  return value;
}

// Possible existing matches for a proposed new member, so an admin doesn't
// create a duplicate. Same last name (case-insensitive) and either the same
// first name or the same birth date.
export function findDuplicateCandidates<
  T extends { first_name: string; last_name: string; date_of_birth?: string | null },
>(candidate: { first_name: string; last_name: string; date_of_birth?: string | null }, roster: T[]): T[] {
  const ln = (candidate.last_name ?? "").trim().toLowerCase();
  const fn = (candidate.first_name ?? "").trim().toLowerCase();
  const dob = candidate.date_of_birth ?? null;
  return roster.filter((p) => {
    if (p.last_name.trim().toLowerCase() !== ln) return false;
    return p.first_name.trim().toLowerCase() === fn || (!!dob && p.date_of_birth === dob);
  });
}
