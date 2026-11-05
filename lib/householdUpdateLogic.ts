// Pure logic for the household self-update feature: validating what a parent
// typed, turning it into per-field changes against the current Subsplash
// values, and detecting drift at review time. No database or Subsplash calls
// here so it's cheap to test; storage lives in lib/householdUpdates.ts.

import { graduationYearForGradeValue, gradeLabelForValue, gradeValueForGraduationYear } from "./grades";

export type HomeAddressField = "home_street" | "home_city" | "home_state" | "home_postal_code";
export type ProfileField =
  | "first_name"
  | "last_name"
  | "date_of_birth"
  | "graduation_year"
  | "phone_number"
  | HomeAddressField
  | "allergy_notes"
  | "care_notes";
export type AddressField = "street" | "city" | "state" | "postal_code";
export type NewMemberRole = "parent" | "guardian" | "child";
export type ChangeField = ProfileField | AddressField | "household_role";
export type SubjectType = "profile" | "household" | "new_member";

export const PROFILE_FIELDS: ProfileField[] = [
  "first_name",
  "last_name",
  "date_of_birth",
  "graduation_year",
  "phone_number",
  "home_street",
  "home_city",
  "home_state",
  "home_postal_code",
  "allergy_notes",
  "care_notes",
];
// A person's own address (not the household's), keyed by the Subsplash
// address part each one is written to.
export const HOME_ADDRESS_FIELDS: Record<HomeAddressField, AddressField> = {
  home_street: "street",
  home_city: "city",
  home_state: "state",
  home_postal_code: "postal_code",
};
// Optional extras that can ride along with a brand-new member (they are
// written with a follow-up update once the profile exists).
export const EXTRA_MEMBER_FIELDS: ChangeField[] = [
  "phone_number",
  "home_street",
  "home_city",
  "home_state",
  "home_postal_code",
  "allergy_notes",
  "care_notes",
];
export const ADDRESS_FIELDS: AddressField[] = ["street", "city", "state", "postal_code"];

export const FIELD_LABELS: Record<ChangeField, string> = {
  first_name: "First name",
  last_name: "Last name",
  date_of_birth: "Date of birth",
  graduation_year: "Grade",
  phone_number: "Phone number",
  home_street: "Home street",
  home_city: "Home city",
  home_state: "Home state",
  home_postal_code: "Home ZIP code",
  allergy_notes: "Allergy notes",
  care_notes: "Care notes",
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

// Notes keep their line breaks; only the ends are trimmed. Empty means none.
const normNote = (v: string | null | undefined): string | null => {
  const t = (v ?? "").replace(/\r\n?/g, "\n").trim();
  return t === "" ? null : t;
};

const NOTE_MAX = 1000;

// US numbers are stored as 10 digits (a leading 1 is dropped). Anything else
// is kept as typed digits so it still compares equal to itself.
export function normPhone(v: string | null | undefined): string | null {
  let digits = (v ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits === "" ? null : digits;
}

export function formatUsPhone(v: string | null | undefined): string {
  const d = normPhone(v);
  if (!d) return "";
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
}

export interface HomeAddressInput {
  home_street?: string | null;
  home_city?: string | null;
  home_state?: string | null;
  home_postal_code?: string | null;
}

export interface OptionalContactInput extends HomeAddressInput {
  phone_number?: string | null;
  allergy_notes?: string | null;
  care_notes?: string | null;
}

// Validates the optional phone / home address / notes a parent may fill in.
// Everything here is optional; a partly filled address is rejected so we never
// store half an address.
function checkOptionalContact(
  input: OptionalContactInput,
  opts: { allowNotes: boolean },
  errors: Record<string, string>
) {
  const phone = normPhone(input.phone_number);
  if (phone && phone.length !== 10) errors.phone_number = "Enter a 10-digit phone number.";

  const addr: Record<HomeAddressField, string | null> = {
    home_street: norm(input.home_street),
    home_city: norm(input.home_city),
    home_state: norm(input.home_state),
    home_postal_code: norm(input.home_postal_code),
  };
  const anyAddr = Object.values(addr).some(Boolean);
  if (anyAddr) {
    (Object.keys(addr) as HomeAddressField[]).forEach((k) => {
      if (!addr[k]) errors[k] = "Complete the address, or clear all address fields.";
    });
    if (addr.home_street && addr.home_street.length > 200) errors.home_street = "Street is too long.";
    if (addr.home_city && addr.home_city.length > 100) errors.home_city = "City is too long.";
    if (addr.home_state && addr.home_state.length > 50) errors.home_state = "State is too long.";
    if (addr.home_postal_code && !/^[A-Za-z0-9 -]{3,12}$/.test(addr.home_postal_code)) {
      errors.home_postal_code = "Enter a valid ZIP code.";
    }
  }

  const allergy = opts.allowNotes ? normNote(input.allergy_notes) : null;
  const care = opts.allowNotes ? normNote(input.care_notes) : null;
  if (allergy && allergy.length > NOTE_MAX) errors.allergy_notes = `Keep this under ${NOTE_MAX} characters.`;
  if (care && care.length > NOTE_MAX) errors.care_notes = `Keep this under ${NOTE_MAX} characters.`;

  return { phone, addr, allergy, care };
}

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

export interface ProfileFormInput extends OptionalContactInput {
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
  phone_number?: string | null;
  address_parts?: Partial<Record<AddressField, string | null | undefined>> | null;
  allergy_notes?: string | null;
  care_notes?: string | null;
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
  const contact = checkOptionalContact(input, { allowNotes: opts.isChild }, errors);
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
  // Optional extras: blank means "none", so a parent may also clear them.
  push("phone_number", normPhone(current.phone_number), contact.phone);
  for (const [field, part] of Object.entries(HOME_ADDRESS_FIELDS) as [HomeAddressField, AddressField][]) {
    push(field, norm(current.address_parts?.[part]), contact.addr[field]);
  }
  if (opts.isChild) {
    push("allergy_notes", normNote(current.allergy_notes), contact.allergy);
    push("care_notes", normNote(current.care_notes), contact.care);
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

export interface NewMemberInput extends OptionalContactInput {
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
  const contact = checkOptionalContact(input, { allowNotes: isChild }, errors);
  if (Object.keys(errors).length > 0) return { changes: [], errors };

  changes.push({ field: "first_name", oldValue: null, newValue: first });
  changes.push({ field: "last_name", oldValue: null, newValue: last });
  changes.push({ field: "household_role", oldValue: null, newValue: input.role });
  if (dob) changes.push({ field: "date_of_birth", oldValue: null, newValue: dob });
  if (gradYear !== undefined) changes.push({ field: "graduation_year", oldValue: null, newValue: String(gradYear) });
  if (contact.phone) changes.push({ field: "phone_number", oldValue: null, newValue: contact.phone });
  for (const field of Object.keys(HOME_ADDRESS_FIELDS) as HomeAddressField[]) {
    if (contact.addr[field]) changes.push({ field, oldValue: null, newValue: contact.addr[field] });
  }
  if (contact.allergy) changes.push({ field: "allergy_notes", oldValue: null, newValue: contact.allergy });
  if (contact.care) changes.push({ field: "care_notes", oldValue: null, newValue: contact.care });
  return { changes, errors };
}

// Review-time drift: the value Subsplash holds now differs from the value the
// household saw when they proposed the change.
export function hasDrifted(oldValue: string | null, liveValue: string | null): boolean {
  return normNote(oldValue) !== normNote(liveValue) && norm(oldValue) !== norm(liveValue);
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
  if (field === "phone_number") return formatUsPhone(value) || "—";
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
