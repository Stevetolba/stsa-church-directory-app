import { describe, expect, it } from "vitest";
import { summarize } from "./attendance";
import type { CheckInRecord } from "@/types/attendance";

function rec(partial: Partial<CheckInRecord>): CheckInRecord {
  return {
    id: partial.id ?? crypto.randomUUID(),
    seriesId: "s",
    eventId: "e",
    occurrenceDate: "2026-07-19",
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
