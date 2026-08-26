import { describe, expect, it } from "vitest";
import { attachGrades, computeAbsentees, summarize, summarizeSeriesFrequency } from "./attendance";
import type { SeriesFrequencyPerson } from "./attendance";
import type { CheckInRecord } from "@/types/attendance";

function rec(partial: Partial<CheckInRecord>): CheckInRecord {
  return {
    id: partial.id ?? crypto.randomUUID(),
    seriesId: partial.seriesId ?? "s",
    eventId: "e",
    occurrenceDate: partial.occurrenceDate ?? "2026-07-19",
    profileId: partial.profileId ?? crypto.randomUUID(),
    displayName: partial.displayName ?? "Someone",
    isChild: partial.isChild ?? false,
    sessionId: partial.sessionId ?? null,
    sessionName: partial.sessionName ?? null,
    checkedInAt: "2026-07-19T13:05:00Z",
    checkedInBy: "office@example.org",
    droppedOffByProfileId: partial.droppedOffByProfileId ?? null,
    droppedOffByName: partial.droppedOffByName ?? null,
    matchCode: partial.matchCode ?? null,
    checkedOutAt: partial.checkedOutAt ?? null,
    checkedOutBy: partial.checkedOutBy ?? null,
    method: "live",
    isGuest: partial.isGuest ?? false,
  };
}

describe("summarize", () => {
  it("counts total, children, adults, guests and per-session", () => {
    const records = [
      rec({ isChild: true, sessionId: "a", sessionName: "Pre-K" }),
      rec({ isChild: true, sessionId: "a", sessionName: "Pre-K" }),
      rec({ isChild: false, sessionId: "g", sessionName: "General" }),
      rec({ isGuest: true, sessionId: "g", sessionName: "General" }),
    ];
    const s = summarize(records);
    expect(s.total).toBe(4);
    expect(s.children).toBe(2);
    expect(s.adults).toBe(2);
    expect(s.guests).toBe(1);
    expect(s.bySession.find((b) => b.sessionName === "Pre-K")?.count).toBe(2);
    expect(s.bySession.find((b) => b.sessionName === "General")?.count).toBe(2);
  });
});

describe("summarizeSeriesFrequency", () => {
  const occurrenceDates = ["2026-07-05", "2026-07-12", "2026-07-19"];

  it("groups by person, sorted most-to-least frequent", () => {
    const records = [
      rec({ profileId: "p1", displayName: "Emily", occurrenceDate: "2026-07-05" }),
      rec({ profileId: "p1", displayName: "Emily", occurrenceDate: "2026-07-12" }),
      rec({ profileId: "p1", displayName: "Emily", occurrenceDate: "2026-07-19" }),
      rec({ profileId: "p2", displayName: "Luke", occurrenceDate: "2026-07-19" }),
    ];
    const result = summarizeSeriesFrequency(records, occurrenceDates);
    expect(result.occurrenceDates).toEqual(occurrenceDates);
    expect(result.people).toHaveLength(2);
    expect(result.people[0]).toMatchObject({
      profileId: "p1",
      attendedDates: ["2026-07-05", "2026-07-12", "2026-07-19"],
      lastAttended: "2026-07-19",
    });
    expect(result.people[1]).toMatchObject({ profileId: "p2", attendedDates: ["2026-07-19"] });
  });

  it("ignores check-ins outside the given occurrence dates", () => {
    const records = [rec({ profileId: "p1", occurrenceDate: "2099-01-01" })];
    const result = summarizeSeriesFrequency(records, occurrenceDates);
    expect(result.people).toHaveLength(0);
  });

  it("counts a repeat check-in on the same date once, not twice", () => {
    const records = [
      rec({ profileId: "p1", occurrenceDate: "2026-07-05" }),
      rec({ profileId: "p1", occurrenceDate: "2026-07-05" }),
    ];
    const result = summarizeSeriesFrequency(records, occurrenceDates);
    expect(result.people[0].attendedDates).toEqual(["2026-07-05"]);
  });
});

describe("computeAbsentees", () => {
  it("returns roster members with no attendance", () => {
    const roster = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
    const attended = new Set(["p2"]);
    expect(computeAbsentees(roster, attended)).toEqual([{ id: "p1" }, { id: "p3" }]);
  });

  it("returns everyone when nobody attended", () => {
    const roster = [{ id: "p1" }, { id: "p2" }];
    expect(computeAbsentees(roster, new Set())).toEqual(roster);
  });

  it("returns nobody when everyone attended", () => {
    const roster = [{ id: "p1" }, { id: "p2" }];
    expect(computeAbsentees(roster, new Set(["p1", "p2"]))).toEqual([]);
  });
});

function seriesPerson(partial: Partial<SeriesFrequencyPerson> & { profileId: string }): SeriesFrequencyPerson {
  return {
    displayName: "Someone",
    isChild: true,
    attendedDates: [],
    lastAttended: null,
    ...partial,
  };
}

describe("attachGrades", () => {
  it("attaches a matched profile's current grade and its sortable ordinal", async () => {
    // profile-lily-whitfield is a real lib/mockData.ts fixture with
    // academic_grade: "5th Grade" / academic_grade_value: 7 (SUBSPLASH_USE_MOCK
    // defaults true in the test env, so searchProfiles reads from those
    // fixtures).
    const people = [seriesPerson({ profileId: "profile-lily-whitfield", displayName: "Lily Whitfield" })];
    const [result] = await attachGrades(people);
    expect(result.grade).toBe("5th Grade");
    expect(result.gradeValue).toBe(7);
  });

  it("gives null grade and gradeValue for a profile id with no match (e.g. a guest row)", async () => {
    const people = [seriesPerson({ profileId: "guest:subsplash:doesnotexist", displayName: "A Visitor" })];
    const [result] = await attachGrades(people);
    expect(result.grade).toBeNull();
    expect(result.gradeValue).toBeNull();
  });

  it("returns an empty array unchanged, without fetching profiles", async () => {
    expect(await attachGrades([])).toEqual([]);
  });
});
