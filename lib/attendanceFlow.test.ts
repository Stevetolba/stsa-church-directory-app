// End-to-end exercise of the app-owned attendance store against the mock
// events, in the same in-memory mode the app uses when DATABASE_URL is unset
// (ADR-0015). Proves the check-in → check-out → undo lifecycle and the
// reporting queries the UI depends on.

import { describe, expect, it } from "vitest";
import { mockEvents } from "./mockData";
import { listTodaysEvents, listOccurrences } from "./events";
import {
  attendedProfileIds,
  checkOut,
  listCheckIns,
  recordCheckIn,
  removeCheckIn,
  summarize,
} from "./attendance";

const liveEvent = mockEvents.find((e) => e.id === "event-midweek-today")!;

describe("attendance flow (mock store)", () => {
  it("seeds today's event and a live check-in window", async () => {
    const today = await listTodaysEvents();
    expect(today.some((e) => e.id === "event-midweek-today")).toBe(true);
  });

  it("checks a person in, out, back in, then undoes", async () => {
    const base = {
      seriesId: liveEvent.series_id,
      eventId: liveEvent.id,
      occurrenceDate: liveEvent.occurrence_date,
      profileId: "profile-daniel-okafor",
      displayName: "Daniel Okafor",
      isChild: false,
      checkedInBy: "office@gracechapel.org",
    };

    await recordCheckIn({ ...base, sessionId: null, sessionName: null });
    let records = await listCheckIns(liveEvent.series_id, liveEvent.occurrence_date);
    expect(records.some((r) => r.profileId === "profile-daniel-okafor")).toBe(true);
    expect(summarize(records).present).toBe(1);

    // Double check-in is idempotent (unique per person/occurrence).
    await recordCheckIn({ ...base, sessionId: null, sessionName: null });
    records = await listCheckIns(liveEvent.series_id, liveEvent.occurrence_date);
    expect(records.filter((r) => r.profileId === "profile-daniel-okafor")).toHaveLength(1);

    await checkOut({
      seriesId: liveEvent.series_id,
      occurrenceDate: liveEvent.occurrence_date,
      profileId: "profile-daniel-okafor",
      checkedOutBy: "office@gracechapel.org",
    });
    records = await listCheckIns(liveEvent.series_id, liveEvent.occurrence_date);
    expect(records.find((r) => r.profileId === "profile-daniel-okafor")?.checkedOutAt).toBeTruthy();
    expect(summarize(records).present).toBe(0);

    // Re-check-in clears the checkout (person returned).
    await recordCheckIn({ ...base, sessionId: null, sessionName: null });
    records = await listCheckIns(liveEvent.series_id, liveEvent.occurrence_date);
    expect(records.find((r) => r.profileId === "profile-daniel-okafor")?.checkedOutAt).toBeNull();

    await removeCheckIn({
      seriesId: liveEvent.series_id,
      occurrenceDate: liveEvent.occurrence_date,
      profileId: "profile-daniel-okafor",
    });
    records = await listCheckIns(liveEvent.series_id, liveEvent.occurrence_date);
    expect(records.some((r) => r.profileId === "profile-daniel-okafor")).toBe(false);
  });

  it("exposes seeded recurring attendance for reports", async () => {
    // The Arlington Sunday School series has occurrences and a regular child.
    const occurrences = await listOccurrences("series-ss-arlington");
    expect(occurrences.length).toBeGreaterThan(0);

    const attended = await attendedProfileIds(
      "series-ss-arlington",
      occurrences.map((o) => o.occurrence_date)
    );
    expect(attended.has("profile-lily-whitfield")).toBe(true);
  });
});
