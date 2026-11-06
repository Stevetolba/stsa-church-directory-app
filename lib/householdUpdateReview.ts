// Builds the admin comparison view: for every proposed change, what Subsplash
// had when the household proposed it, what it has now, and what is proposed.

import type { Household } from "@/types/household";
import {
  FIELD_LABELS,
  HOME_ADDRESS_FIELDS,
  displayValue,
  hasDrifted,
  normGender,
  normPhone,
  type ChangeField,
  type HomeAddressField,
  type SubjectType,
} from "./householdUpdateLogic";
import type { UpdateChange } from "./householdUpdates";

export interface ReviewRow {
  id: string;
  fieldLabel: string;
  atSubmission: string;
  now: string;
  proposed: string;
  drifted: boolean;
  decision: UpdateChange["decision"];
  applied: boolean;
  error: string | null;
}

export interface ReviewGroup {
  key: string;
  type: SubjectType;
  subjectId: string;
  label: string;
  rows: ReviewRow[];
}

function liveValue(household: Household | null, c: UpdateChange): string | null {
  if (!household || c.subjectType === "new_member") return null;
  if (c.subjectType === "household") {
    return (household.address_parts?.[c.field as "street" | "city" | "state" | "postal_code"] as string | undefined) ?? null;
  }
  const member = household.members?.find((m) => m.id === c.subjectId);
  if (!member) return null;
  if (c.field === "phone_number") return normPhone(member.phone_number);
  if (c.field === "gender") return normGender(member.gender);
  if (c.field === "email") return member.email ? member.email.trim().toLowerCase() : null;
  if (c.field in HOME_ADDRESS_FIELDS) {
    return member.address_parts?.[HOME_ADDRESS_FIELDS[c.field as HomeAddressField]] ?? null;
  }
  const value =
    c.field === "graduation_year"
      ? member.graduation_year
      : (member as unknown as Record<string, unknown>)[c.field as ChangeField];
  return value == null || value === "" ? null : String(value);
}

export function buildReviewGroups(changes: UpdateChange[], household: Household | null, now: Date = new Date()): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>();
  for (const c of changes) {
    const key = `${c.subjectType}:${c.subjectId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        type: c.subjectType,
        subjectId: c.subjectId,
        label: c.subjectLabel || (c.subjectType === "household" ? "Household address" : c.subjectId),
        rows: [],
      });
    }
    const live = liveValue(household, c);
    groups.get(key)!.rows.push({
      id: c.id,
      fieldLabel: FIELD_LABELS[c.field],
      atSubmission: displayValue(c.field, c.oldValue, now),
      now: c.subjectType === "new_member" ? "—" : displayValue(c.field, live, now),
      proposed: displayValue(c.field, c.newValue, now),
      // Once applied, "now" legitimately equals the proposal; drift only matters before that.
      drifted: c.subjectType !== "new_member" && !c.appliedAt && hasDrifted(c.oldValue, live),
      decision: c.decision,
      applied: !!c.appliedAt,
      error: c.applyError,
    });
  }
  // Profiles first, then the address, then new members.
  const order: Record<SubjectType, number> = { profile: 0, household: 1, new_member: 2 };
  return Array.from(groups.values()).sort((a, b) => order[a.type] - order[b.type]);
}
