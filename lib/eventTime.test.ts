import { describe, expect, it } from "vitest";
import {
  checkInWindow,
  isWithinCheckInWindow,
  occurrenceDateInTz,
  windowState,
} from "./eventTime";

const TZ = "America/New_York";

describe("checkInWindow", () => {
  const event = { start_at: "2026-07-19T13:00:00Z", end_at: "2026-07-19T14:30:00Z" };

  it("opens 45 min before start and closes 45 min after end", () => {
    const { opensAt, closesAt } = checkInWindow(event);
    expect(opensAt.toISOString()).toBe("2026-07-19T12:15:00.000Z");
    expect(closesAt.toISOString()).toBe("2026-07-19T15:15:00.000Z");
  });

  it("falls back to start_at when end_at is missing", () => {
    const { closesAt } = checkInWindow({ start_at: "2026-07-19T13:00:00Z" });
    expect(closesAt.toISOString()).toBe("2026-07-19T13:45:00.000Z");
  });
});

describe("windowState / isWithinCheckInWindow", () => {
  const event = { start_at: "2026-07-19T13:00:00Z", end_at: "2026-07-19T14:30:00Z" };

  it("is upcoming before the window opens", () => {
    expect(windowState(event, new Date("2026-07-19T12:00:00Z"))).toBe("upcoming");
    expect(isWithinCheckInWindow(event, new Date("2026-07-19T12:00:00Z"))).toBe(false);
  });

  it("is open within the window (incl. after end, before close)", () => {
    expect(windowState(event, new Date("2026-07-19T12:30:00Z"))).toBe("open");
    expect(windowState(event, new Date("2026-07-19T15:00:00Z"))).toBe("open");
    expect(isWithinCheckInWindow(event, new Date("2026-07-19T15:00:00Z"))).toBe(true);
  });

  it("is closed after end + 45 min", () => {
    expect(windowState(event, new Date("2026-07-19T15:30:00Z"))).toBe("closed");
  });
});

describe("occurrenceDateInTz", () => {
  it("returns the event-local calendar date", () => {
    // 9am ET = 13:00Z in July (EDT); still July 19 in New York.
    expect(occurrenceDateInTz("2026-07-19T13:00:00Z", TZ)).toBe("2026-07-19");
  });

  it("shifts across midnight by timezone", () => {
    // 01:00Z is still the previous evening (Jul 18, 9pm) in New York.
    expect(occurrenceDateInTz("2026-07-19T01:00:00Z", TZ)).toBe("2026-07-18");
  });
});
