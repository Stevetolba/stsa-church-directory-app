// Read model for the household self-update pages: the household as Subsplash
// has it now, with this household's saved-but-unreviewed proposals laid over
// it so a parent sees their own edits when they come back.

import { getHousehold } from "./subsplash";
import { householdMemberType } from "./household";
import { getOpenRequest, listChanges, type UpdateChange, type UpdateRequest } from "./householdUpdates";
import { gradeLabelForValue, gradeValueForGraduationYear } from "./grades";
import { formatUsPhone, normGender, HOME_ADDRESS_FIELDS, type HomeAddressField } from "./householdUpdateLogic";
import type { Profile } from "@/types/profile";
import type { Household } from "@/types/household";

export interface MemberView {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  isChild: boolean;
  roleLabel: string;
  gradeValue: number | null;
  gradeLabel: string | null;
  hasPendingChanges: boolean;
  phone_number: string;
  gender: string;
  email: string;
  home_street: string;
  home_city: string;
  home_state: string;
  home_postal_code: string;
  allergy_notes: string;
  care_notes: string;
}

export interface NewMemberView {
  key: string;
  first_name: string;
  last_name: string;
  role: string;
  date_of_birth: string;
  gradeValue: number | null;
  gradeLabel: string | null;
  phone_number: string;
  gender: string;
  email: string;
  home_street: string;
  home_city: string;
  home_state: string;
  home_postal_code: string;
  allergy_notes: string;
  care_notes: string;
}

export interface AddressView {
  street: string;
  city: string;
  state: string;
  postal_code: string;
  hasPendingChanges: boolean;
}

export interface PortalView {
  household: Household;
  members: MemberView[];
  newMembers: NewMemberView[];
  address: AddressView;
  request: UpdateRequest | null;
  changes: UpdateChange[];
}

function latest(changes: UpdateChange[], type: UpdateChange["subjectType"], id: string, field: string): string | undefined {
  return changes.find((c) => c.subjectType === type && c.subjectId === id && c.field === field)?.newValue ?? undefined;
}

// A saved proposal wins over the live value, and a proposal that clears an
// optional field (new value empty) must show as cleared, not fall back.
function overlay(changes: UpdateChange[], type: UpdateChange["subjectType"], id: string, field: string, live: string): string {
  const c = changes.find((x) => x.subjectType === type && x.subjectId === id && x.field === field);
  return c ? (c.newValue ?? "") : live;
}

function gradeFrom(profile: Pick<Profile, "academic_grade_value">, changes: UpdateChange[], id: string): number | null {
  const year = latest(changes, "profile", id, "graduation_year");
  if (year) return gradeValueForGraduationYear(Number(year)) ?? null;
  return profile.academic_grade_value ?? null;
}

function homeAddress(
  changes: UpdateChange[],
  type: UpdateChange["subjectType"],
  id: string,
  live: Partial<Record<"street" | "city" | "state" | "postal_code", string | undefined>> | undefined
): Record<HomeAddressField, string> {
  const out = {} as Record<HomeAddressField, string>;
  for (const [field, part] of Object.entries(HOME_ADDRESS_FIELDS) as [HomeAddressField, keyof NonNullable<typeof live>][]) {
    out[field] = overlay(changes, type, id, field, live?.[part] ?? "");
  }
  return out;
}

export async function loadPortal(householdId: string): Promise<PortalView | null> {
  const household = await getHousehold(householdId);
  if (!household) return null;
  const request = await getOpenRequest(householdId);
  // Rows already written to Subsplash (instant apply, ADR-0031) are history;
  // the live values already include them.
  const changes = request ? (await listChanges(request.id)).filter((c) => !c.appliedAt) : [];

  const members: MemberView[] = (household.members ?? [])
    .map((m): MemberView => {
      const isChild = householdMemberType(m.household_role) === "Child";
      const gradeValue = isChild ? gradeFrom(m, changes, m.id) : null;
      return {
        id: m.id,
        first_name: latest(changes, "profile", m.id, "first_name") ?? m.first_name,
        last_name: latest(changes, "profile", m.id, "last_name") ?? m.last_name,
        date_of_birth: latest(changes, "profile", m.id, "date_of_birth") ?? m.date_of_birth ?? "",
        isChild,
        roleLabel: isChild ? "Child" : "Adult",
        gradeValue,
        gradeLabel: gradeLabelForValue(gradeValue ?? undefined) ?? null,
        hasPendingChanges: changes.some((c) => c.subjectType === "profile" && c.subjectId === m.id),
        phone_number: formatUsPhone(overlay(changes, "profile", m.id, "phone_number", m.phone_number ?? "")),
        gender: overlay(changes, "profile", m.id, "gender", normGender(m.gender) ?? ""),
        // A child's own email only; an adult's email is their sign-in.
        email: isChild ? overlay(changes, "profile", m.id, "email", m.email ?? "") : "",
        ...homeAddress(changes, "profile", m.id, m.address_parts),
        allergy_notes: overlay(changes, "profile", m.id, "allergy_notes", m.allergy_notes ?? ""),
        care_notes: overlay(changes, "profile", m.id, "care_notes", m.care_notes ?? ""),
      };
    })
    // Adults first, then children, each alphabetical by first name.
    .sort((a, b) => Number(a.isChild) - Number(b.isChild) || a.first_name.localeCompare(b.first_name));

  const newMembers: NewMemberView[] = [];
  for (const key of Array.from(new Set(changes.filter((c) => c.subjectType === "new_member").map((c) => c.subjectId)))) {
    const year = latest(changes, "new_member", key, "graduation_year");
    const gradeValue = year ? (gradeValueForGraduationYear(Number(year)) ?? null) : null;
    newMembers.push({
      key,
      first_name: latest(changes, "new_member", key, "first_name") ?? "",
      last_name: latest(changes, "new_member", key, "last_name") ?? "",
      role: latest(changes, "new_member", key, "household_role") ?? "child",
      date_of_birth: latest(changes, "new_member", key, "date_of_birth") ?? "",
      gradeValue,
      gradeLabel: gradeLabelForValue(gradeValue ?? undefined) ?? null,
      phone_number: formatUsPhone(overlay(changes, "new_member", key, "phone_number", "")),
      gender: overlay(changes, "new_member", key, "gender", ""),
      email: overlay(changes, "new_member", key, "email", ""),
      ...homeAddress(changes, "new_member", key, undefined),
      allergy_notes: overlay(changes, "new_member", key, "allergy_notes", ""),
      care_notes: overlay(changes, "new_member", key, "care_notes", ""),
    });
  }

  const live = household.address_parts ?? {};
  const address: AddressView = {
    street: latest(changes, "household", householdId, "street") ?? live.street ?? "",
    city: latest(changes, "household", householdId, "city") ?? live.city ?? "",
    state: latest(changes, "household", householdId, "state") ?? live.state ?? "",
    postal_code: latest(changes, "household", householdId, "postal_code") ?? live.postal_code ?? "",
    hasPendingChanges: changes.some((c) => c.subjectType === "household"),
  };

  return { household, members, newMembers, address, request, changes };
}

// The member as Subsplash holds them right now (never the proposal), for
// diffing and for confirming a profile id really belongs to this household.
export async function getLiveMember(householdId: string, profileId: string): Promise<Profile | null> {
  const household = await getHousehold(householdId);
  return household?.members?.find((m) => m.id === profileId) ?? null;
}
