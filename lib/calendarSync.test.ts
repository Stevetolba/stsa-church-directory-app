import { beforeEach, describe, expect, it } from "vitest";
import {
  googleEventIdFor,
  isPublicOneOffRaw,
  isPublicSeriesRaw,
  lastCalendarSync,
  oneOffToGoogleInput,
  parseDtStart,
  recurrenceLinesWithoutDtStart,
  seriesToGoogleInput,
  staleEventIds,
  syncPublicEventsToCalendar,
  type PublicOneOffEvent,
  type PublicSeries,
} from "./calendarSync";

describe("isPublicOneOffRaw", () => {
  it("requires both published status and public visibility", () => {
    expect(isPublicOneOffRaw({ status: "published", visibility: "public" })).toBe(true);
    expect(isPublicOneOffRaw({ status: "draft", visibility: "public" })).toBe(false);
    expect(isPublicOneOffRaw({ status: "published", visibility: "dashboard" })).toBe(false);
    expect(isPublicOneOffRaw({})).toBe(false);
  });
});

describe("isPublicSeriesRaw", () => {
  it("requires public visibility and a published_at timestamp", () => {
    expect(isPublicSeriesRaw({ visibility: "public", published_at: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(isPublicSeriesRaw({ visibility: "public", published_at: null })).toBe(false);
    expect(isPublicSeriesRaw({ visibility: "dashboard", published_at: "2026-01-01T00:00:00Z" })).toBe(false);
  });
});

describe("googleEventIdFor", () => {
  it("is deterministic for the same Subsplash id", () => {
    expect(googleEventIdFor("abc-123")).toBe(googleEventIdFor("abc-123"));
  });

  it("differs for different ids", () => {
    expect(googleEventIdFor("abc-123")).not.toBe(googleEventIdFor("abc-124"));
  });

  it("only uses characters Google Calendar allows in a client-specified event id", () => {
    // Google requires lowercase letters a-v and digits 0-9, 5-1024 chars.
    expect(googleEventIdFor("some-real-subsplash-uuid")).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});

describe("parseDtStart", () => {
  it("parses a DTSTART line with a TZID", () => {
    const parts = parseDtStart([
      "DTSTART;TZID=America/New_York:20260104T093000",
      "RRULE:FREQ=WEEKLY;BYDAY=SU",
    ]);
    expect(parts).toEqual({ year: 2026, month: 1, day: 4, hour: 9, minute: 30, second: 0 });
  });

  it("parses a DTSTART line without a TZID", () => {
    const parts = parseDtStart(["DTSTART:20260104T093000", "RRULE:FREQ=WEEKLY;BYDAY=SU"]);
    expect(parts).toEqual({ year: 2026, month: 1, day: 4, hour: 9, minute: 30, second: 0 });
  });

  it("returns null when there's no DTSTART line", () => {
    expect(parseDtStart(["RRULE:FREQ=WEEKLY;BYDAY=SU"])).toBeNull();
  });
});

describe("recurrenceLinesWithoutDtStart", () => {
  it("drops the DTSTART line and keeps everything else", () => {
    const lines = [
      "DTSTART;TZID=America/New_York:20260104T093000",
      "RRULE:FREQ=WEEKLY;BYDAY=SU",
      "EXDATE;TZID=America/New_York:20260412T093000",
    ];
    expect(recurrenceLinesWithoutDtStart(lines)).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=SU",
      "EXDATE;TZID=America/New_York:20260412T093000",
    ]);
  });
});

describe("staleEventIds", () => {
  it("returns previously-synced ids that aren't in the current set", () => {
    const current = new Set(["a", "b"]);
    const previous = new Set(["a", "b", "c", "d"]);
    expect(staleEventIds(current, previous).sort()).toEqual(["c", "d"]);
  });

  it("returns nothing when everything previously synced is still current", () => {
    const current = new Set(["a", "b", "c"]);
    const previous = new Set(["a", "b"]);
    expect(staleEventIds(current, previous)).toEqual([]);
  });
});

describe("oneOffToGoogleInput", () => {
  it("maps a one-off event straight through, tagging it with the Subsplash id", () => {
    const event: PublicOneOffEvent = {
      id: "ev-1",
      title: "Parish Picnic",
      description: "All welcome",
      startAt: "2026-09-06T16:00:00.000Z",
      endAt: "2026-09-06T19:00:00.000Z",
      timezone: "America/New_York",
    };
    const input = oneOffToGoogleInput(event);
    expect(input).toMatchObject({
      googleEventId: googleEventIdFor("ev-1"),
      subsplashId: "ev-1",
      summary: "Parish Picnic",
      description: "All welcome",
      start: { dateTime: "2026-09-06T16:00:00.000Z", timeZone: "America/New_York" },
      end: { dateTime: "2026-09-06T19:00:00.000Z", timeZone: "America/New_York" },
    });
    expect(input.recurrence).toBeUndefined();
  });

  it("defaults a missing end time to one hour after start", () => {
    const event: PublicOneOffEvent = {
      id: "ev-2",
      title: "No end time given",
      startAt: "2026-09-06T16:00:00.000Z",
      timezone: "America/New_York",
    };
    const input = oneOffToGoogleInput(event);
    expect(input.end.dateTime).toBe("2026-09-06T17:00:00.000Z");
  });
});

describe("seriesToGoogleInput", () => {
  const series: PublicSeries = {
    id: "series-liturgy",
    title: "LITURGY",
    description: "Sunday Divine Liturgy",
    timezone: "America/New_York",
    eventDurationMinutes: 150,
    repetitionRules: [
      "DTSTART;TZID=America/New_York:20260104T093000",
      "RRULE:FREQ=WEEKLY;BYDAY=SU",
      "EXDATE;TZID=America/New_York:20260412T093000",
    ],
  };

  it("builds a recurring event input from the series' DTSTART and duration", () => {
    const input = seriesToGoogleInput(series);
    expect(input).not.toBeNull();
    expect(input?.googleEventId).toBe(googleEventIdFor("series-liturgy"));
    expect(input?.subsplashId).toBe("series-liturgy");
    expect(input?.summary).toBe("LITURGY");
    expect(input?.start.timeZone).toBe("America/New_York");
    // 9:30am EST (UTC-5 in January) -> 14:30 UTC.
    expect(input?.start.dateTime).toBe("2026-01-04T14:30:00.000Z");
    // + 150 minutes.
    expect(input?.end.dateTime).toBe("2026-01-04T17:00:00.000Z");
    expect(input?.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=SU",
      "EXDATE;TZID=America/New_York:20260412T093000",
    ]);
  });

  it("returns null when the series has no parseable DTSTART", () => {
    expect(seriesToGoogleInput({ ...series, repetitionRules: ["RRULE:FREQ=WEEKLY;BYDAY=SU"] })).toBeNull();
  });
});

// Exercises the full orchestration against the mock Subsplash fixtures and
// mock Google Calendar/DB stores (GOOGLE_CALENDAR_USE_MOCK and
// SUBSPLASH_USE_MOCK both default true in the test env) — proves the pieces
// wire together correctly, same spirit as attendanceImport.test.ts's
// importOccurrence/runAttendanceImport tests.
describe("syncPublicEventsToCalendar", () => {
  beforeEach(() => {
    globalThis.__mockCalendarEvents = new Map();
    globalThis.__mockCalendarSyncs = [];
  });

  it("creates every mock public event/series on the first run", async () => {
    const run = await syncPublicEventsToCalendar();
    expect(run.error).toBeNull();
    expect(run.eventsSeen).toBeGreaterThan(0);
    expect(run.eventsCreated).toBe(run.eventsSeen);
    expect(run.eventsUpdated).toBe(0);
    expect(run.eventsDeleted).toBe(0);
  });

  it("is idempotent — re-running updates rather than re-creating, and prunes nothing new", async () => {
    await syncPublicEventsToCalendar();
    const second = await syncPublicEventsToCalendar();
    expect(second.error).toBeNull();
    expect(second.eventsCreated).toBe(0);
    expect(second.eventsUpdated).toBe(second.eventsSeen);
    expect(second.eventsDeleted).toBe(0);
  });

  it("records the run and lastCalendarSync returns it", async () => {
    const run = await syncPublicEventsToCalendar();
    const last = await lastCalendarSync();
    expect(last).toMatchObject({ eventsSeen: run.eventsSeen, error: null });
  });
});
