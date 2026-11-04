// Read model for the household self-update pages: the household as Subsplash
// has it now, with this household's saved-but-unreviewed proposals laid over
// it so a parent sees their own edits when they come back.

import { getHousehold } from "./subsplash";
import { householdMemberType } from "./household";
import { getOpenRequest, listChanges, type UpdateChange, type UpdateRequest } from "./householdUpdates";
import { gradeLabelForValue, gradeValueForGraduationYear } from "./grades";
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
}

export interface NewMemberView {
  key: string;
  first_name: string;
  last_name: string;
  role: string;
  date_of_birth: string;
  gradeValue: number | null;
  gradeLabel: string | null;
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

function gradeFrom(profile: Pick<Profile, "academic_grade_value">, changes: UpdateChange[], id: string): number | null {
  const year = latest(changes, "profile", id, "graduation_year");
  if (year) return gradeValueForGraduationYear(Number(year)) ?? null;
  return profile.academic_grade_value ?? null;
}

export async function loadPortal(householdId: string): Promise<PortalView | null> {
  const household = await getHousehold(householdId);
  if (!household) return null;
  const request = await getOpenRequest(householdId);
  const changes = request ? await listChanges(request.id) : [];

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
