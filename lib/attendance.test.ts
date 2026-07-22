import { describe, expect, it } from "vitest";
import { buildReprintLabelData, computeAbsentees, summarize, summarizeSeriesFrequency } from "./attendance";
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
  it("counts present, children, adults, guests and per-session", () => {
    const records = [
      rec({ isChild: true, sessionId: "a", sessionName: "Pre-K" }),
      rec({ isChild: true, sessionId: "a", sessionName: "Pre-K", checkedOutAt: "2026-07-19T14:00:00Z" }),
      rec({ isChild: false, sessionId: "g", sessionName: "General" }),
      rec({ isGuest: true, sessionId: "g", sessionName: "General" }),
    ];
    const s = summarize(records);
    expect(s.total).toBe(4);
    expect(s.present).toBe(3); // one checked out
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

describe("buildReprintLabelData", () => {
  // lib/mockData.ts fixtures (SUBSPLASH_USE_MOCK defaults true when unset,
  // as it is in the test env): Lily Whitfield is a child with allergy/care
  // notes; Robert Whitfield is her parent with a phone number on file.
  it("returns null for both when the record isn't a child", async () => {
    const record = rec({ profileId: "profile-robert-whitfield", isChild: false });
    const result = await buildReprintLabelData(record, "Sunday School");
    expect(result).toEqual({ childLabel: null, parentTag: null });
  });

  it("re-fetches allergy/care notes and drop-off phone from the profile, not the record", async () => {
    const record = rec({
      profileId: "profile-lily-whitfield",
      isChild: true,
      matchCode: "AB12",
      droppedOffByProfileId: "profile-robert-whitfield",
      droppedOffByName: "Robert Whitfield",
      sessionName: "Pre-K",
    });
    const result = await buildReprintLabelData(record, "Sunday School");
    expect(result.childLabel).toMatchObject({
      firstName: "Lily",
      lastName: "Whitfield",
      matchCode: "AB12",
      eventTitle: "Sunday School",
      sessionName: "Pre-K",
      contactName: "Robert Whitfield",
      contactPhone: "(614) 555-0143",
      allergyNotes: "Severe peanut allergy — carries an EpiPen.",
      careNotes: "Needs quiet space if overstimulated. Pickup by parent or grandmother only.",
    });
    expect(result.parentTag).toEqual({
      matchCode: "AB12",
      childNames: ["Lily Whitfield"],
      dropOffName: "Robert Whitfield",
    });
  });

  it("has no parent tag when the record has no match code (e.g. an 'everyone' session)", async () => {
    const record = rec({ profileId: "profile-lily-whitfield", isChild: true, matchCode: null });
    const result = await buildReprintLabelData(record, "Liturgy");
    expect(result.parentTag).toBeNull();
    expect(result.childLabel?.matchCode).toBe("");
  });

  it("falls back to the record's displayName for a guest child (no profile to fetch)", async () => {
    const record = rec({
      profileId: "guest:abc123",
      isChild: true,
      isGuest: true,
      displayName: "Visiting Kid",
      matchCode: "ZZ99",
    });
    const result = await buildReprintLabelData(record, "Sunday School");
    expect(result.childLabel).toMatchObject({
      firstName: "Visiting Kid",
      lastName: "",
      allergyNotes: null,
      careNotes: null,
    });
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
