import { describe, expect, it } from "vitest";
import { groupEventsByDate } from "./eventAgenda";
import type { AppEvent } from "@/types/event";

function ev(id: string, date: string, start: string): AppEvent {
  return {
    id,
    series_id: id,
    title: id,
    start_at: start,
    timezone: "America/New_York",
    all_day: false,
    occurrence_date: date,
    source: "standard",
    status: "published",
    check_in_enabled: true,
    sessions: [],
  };
}

describe("groupEventsByDate", () => {
  const now = new Date(2026, 6, 16); // Jul 16 2026 (local)

  it("labels today and tomorrow and orders chronologically", () => {
    const groups = groupEventsByDate(
      [
        ev("b", "2026-07-17", "2026-07-17T13:00:00Z"),
        ev("a", "2026-07-16", "2026-07-16T13:00:00Z"),
      ],
      now
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "Tomorrow"]);
  });

  it("groups multiple events on the same day and sorts by start time", () => {
    const groups = groupEventsByDate(
      [
        ev("late", "2026-07-16", "2026-07-16T15:00:00Z"),
        ev("early", "2026-07-16", "2026-07-16T13:00:00Z"),
      ],
      now
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((e) => e.id)).toEqual(["early", "late"]);
  });
});
