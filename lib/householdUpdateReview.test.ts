import { describe, expect, it } from "vitest";
import { buildReviewGroups } from "./householdUpdateReview";
import type { UpdateChange } from "./householdUpdates";
import type { Household } from "@/types/household";
import type { Profile } from "@/types/profile";

const base = { requestId: "r", subjectLabel: null, decision: "pending", appliedAt: null, applyError: null, createdProfileId: null, createdAt: new Date() } as const;
const change = (o: Partial<UpdateChange> & Pick<UpdateChange, "id" | "subjectType" | "subjectId" | "field">): UpdateChange =>
  ({ ...base, oldValue: null, newValue: null, ...o }) as UpdateChange;

const household = {
  id: "h1", name: "Lee", created_at: "", updated_at: "",
  address_parts: { street: "9 New Rd", city: "Arlington", state: "VA", postal_code: "22201" },
  members: [{ id: "k1", first_name: "Samuel", last_name: "Lee", graduation_year: 2031 } as Profile],
} as Household;

describe("buildReviewGroups", () => {
  it("flags drift when Subsplash changed after the household proposed", () => {
    const groups = buildReviewGroups(
      [
        change({ id: "1", subjectType: "profile", subjectId: "k1", field: "first_name", oldValue: "Sam", newValue: "Sammy" }),
        change({ id: "2", subjectType: "profile", subjectId: "k1", field: "last_name", oldValue: "Lee", newValue: "Li" }),
      ],
      household,
      new Date("2026-11-04")
    );
    const rows = groups[0].rows;
    expect(rows[0]).toMatchObject({ atSubmission: "Sam", now: "Samuel", proposed: "Sammy", drifted: true });
    expect(rows[1]).toMatchObject({ drifted: false });
  });

  it("does not flag drift once applied or for new members", () => {
    const groups = buildReviewGroups(
      [
        change({ id: "1", subjectType: "household", subjectId: "h1", field: "street", oldValue: "1 Old", newValue: "9 New Rd", appliedAt: new Date() }),
        change({ id: "2", subjectType: "new_member", subjectId: "new-1", field: "first_name", newValue: "Eve", subjectLabel: "Eve Lee" }),
      ],
      household
    );
    expect(groups.map((g) => g.type)).toEqual(["household", "new_member"]);
    expect(groups[0].rows[0]).toMatchObject({ drifted: false, applied: true, now: "9 New Rd" });
    expect(groups[1].rows[0]).toMatchObject({ drifted: false, now: "—", proposed: "Eve" });
  });

  it("shows grade as label and year", () => {
    const groups = buildReviewGroups(
      [change({ id: "1", subjectType: "profile", subjectId: "k1", field: "graduation_year", oldValue: "2031", newValue: "2033" })],
      household,
      new Date("2026-11-04")
    );
    expect(groups[0].rows[0].proposed).toBe("6th Grade (class of 2033)");
    expect(groups[0].rows[0].drifted).toBe(false);
  });
});
