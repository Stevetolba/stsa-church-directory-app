import { describe, expect, it } from "vitest";
import { isSundaySchoolSeriesId, SUNDAY_SCHOOL_SERIES_IDS } from "./reportAccess";

describe("isSundaySchoolSeriesId", () => {
  it("is true for each pinned Sunday School series id", () => {
    for (const id of SUNDAY_SCHOOL_SERIES_IDS) {
      expect(isSundaySchoolSeriesId(id)).toBe(true);
    }
  });

  it("is false for an unrelated series id, e.g. LITURGY", () => {
    expect(isSundaySchoolSeriesId("b20a0f15-8403-47eb-aee1-dec62bc66fc6")).toBe(false);
  });
});
