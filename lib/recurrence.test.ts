import { describe, expect, it } from "vitest";
import { expandRepeatingEvent } from "./recurrence";

// Mirrors the real "Sunday School [Leesburg]" RepeatingEvent (ADR-0015
// addendum) — weekly Sunday 11:30am America/New_York, one EXDATE.
const SERIES = {
  id: "series-1",
  timezone: "America/New_York",
  eventDurationMinutes: 60,
  repetitionRules: [
    "DTSTART;TZID=America/New_York:20251026T113000",
    "RRULE:FREQ=WEEKLY;BYDAY=SU",
    "EXDATE;TZID=America/New_York:20260412T113000",
  ],
};

describe("expandRepeatingEvent", () => {
  it("generates one occurrence per Sunday in the window", () => {
    const occurrences = expandRepeatingEvent(
      SERIES,
      new Date("2025-10-26T00:00:00Z"),
      new Date("2025-11-23T00:00:00Z")
    );
    // Oct 26, Nov 2, Nov 9, Nov 16, Nov 23 — 5 Sundays inclusive.
    expect(occurrences).toHaveLength(5);
    expect(occurrences[0].start_at).toBe("2025-10-26T15:30:00.000Z");
  });

  it("excludes the EXDATE occurrence", () => {
    const occurrences = expandRepeatingEvent(
      SERIES,
      new Date("2026-04-05T00:00:00Z"),
      new Date("2026-04-19T00:00:00Z")
    );
    const dates = occurrences.map((o) => o.start_at.slice(0, 10));
    expect(dates).not.toContain("2026-04-12");
    expect(dates).toEqual(["2026-04-05", "2026-04-19"]);
  });

  it("holds the wall-clock time steady across a DST transition", () => {
    // America/New_York switches EST (UTC-5) to EDT (UTC-4) on 2026-03-08.
    const occurrences = expandRepeatingEvent(
      SERIES,
      new Date("2026-03-01T00:00:00Z"),
      new Date("2026-03-15T00:00:00Z")
    );
    const beforeDst = occurrences.find((o) => o.start_at.startsWith("2026-03-01"));
    const afterDst = occurrences.find((o) => o.start_at.startsWith("2026-03-08") || o.start_at.startsWith("2026-03-15"));
    // 11:30am EST = 16:30 UTC; 11:30am EDT = 15:30 UTC. The wall-clock time
    // (11:30am local) must stay fixed even though the UTC instant shifts.
    expect(beforeDst?.start_at).toBe("2026-03-01T16:30:00.000Z");
    expect(afterDst?.start_at).toMatch(/^2026-03-(08|15)T15:30:00\.000Z$/);
  });

  it("computes end_at from eventDurationMinutes", () => {
    const [occurrence] = expandRepeatingEvent(
      SERIES,
      new Date("2025-10-26T00:00:00Z"),
      new Date("2025-10-27T00:00:00Z")
    );
    expect(occurrence.end_at).toBe("2025-10-26T16:30:00.000Z");
  });

  it("returns an empty array for a series with no repetition rules", () => {
    expect(expandRepeatingEvent({ ...SERIES, repetitionRules: [] }, new Date(), new Date())).toEqual([]);
  });
});
