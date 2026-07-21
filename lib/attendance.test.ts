import { describe, expect, it } from "vitest";
import { computeAbsentees, summarize, summarizeSeriesFrequency } from "./attendance";
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
