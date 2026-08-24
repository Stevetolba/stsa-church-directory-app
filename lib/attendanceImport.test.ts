import { describe, expect, it } from "vitest";
import {
  findSeriesByTitle,
  importOccurrence,
  indexProfiles,
  lastImportRunForSeries,
  resolveAttendee,
  resolveDropOffAdult,
  resolveOccurrence,
} from "./attendanceImport";
import { listCheckIns } from "./attendance";
import { listSeries } from "./events";
import type { Profile } from "@/types/profile";

function profile(partial: Partial<Profile> & { id: string; first_name: string; last_name: string }): Profile {
  return {
    email: "",
    status: "Member",
    ...partial,
  } as Profile;
}

const PROFILES: Profile[] = [
  profile({ id: "p-john-smith", first_name: "John", last_name: "Smith", email: "john@example.org" }),
  // A same-name collision — resolveAttendee must refuse to guess between them
  // unless an email can narrow it down.
  profile({ id: "p-john-smith-2", first_name: "John", last_name: "Smith", email: "johnny@example.org" }),
  profile({
    id: "p-lily-child",
    first_name: "Lily",
    last_name: "Doe",
    email: "",
    household_role: "child",
  }),
  profile({ id: "p-shared-email-a", first_name: "A", last_name: "One", email: "shared@example.org" }),
  profile({ id: "p-shared-email-b", first_name: "B", last_name: "Two", email: "shared@example.org" }),
  // Mirrors a real Subsplash export (ADR-0021): the guardian has their own
  // directory profile, and the child's "[Checked in] Email" column often
  // carries the guardian's email, not the child's own.
  profile({ id: "p-heidi-guirguis", first_name: "Heidi", last_name: "Guirguis", email: "heidi_guirguis@yahoo.com" }),
  profile({
    id: "p-sofia-guirguis",
    first_name: "Sofia",
    last_name: "Guirguis",
    email: "",
    household_role: "child",
  }),
];

// Real Subsplash data confirmed a directory profile can come back with
// `email: undefined` at runtime, despite Profile.email being typed as a
// required string — a same-name-collision resolution must not crash on it.
const PROFILE_NO_EMAIL_AT_RUNTIME = {
  ...profile({ id: "p-mark-malak-a", first_name: "Mark", last_name: "Malak" }),
  email: undefined,
} as unknown as Profile;
PROFILES.push(
  PROFILE_NO_EMAIL_AT_RUNTIME,
  profile({ id: "p-mark-malak-b", first_name: "Mark", last_name: "Malak", email: "mark@example.org" })
);

const lookup = indexProfiles(PROFILES);

describe("resolveAttendee", () => {
  it("matches on an explicit Subsplash profile id first", () => {
    const result = resolveAttendee({ name: "Whoever", subsplashProfileId: "p-lily-child" }, lookup);
    expect(result).toEqual({ status: "matched", profileId: "p-lily-child", isChild: true });
  });

  it("matches on a unique full name (case/whitespace-insensitive)", () => {
    const result = resolveAttendee({ name: "  lily   doe " }, lookup);
    expect(result).toEqual({ status: "matched", profileId: "p-lily-child", isChild: true });
  });

  it("narrows an ambiguous name using a matching email", () => {
    const result = resolveAttendee({ name: "John Smith", email: "johnny@example.org" }, lookup);
    expect(result).toEqual({ status: "matched", profileId: "p-john-smith-2", isChild: false });
  });

  it("leaves an ambiguous name unmatched when email doesn't narrow it", () => {
    const result = resolveAttendee({ name: "John Smith" }, lookup);
    expect(result).toEqual({ status: "unmatched" });
  });

  it("doesn't crash narrowing an ambiguous name when a candidate's email is undefined at runtime", () => {
    // Regression: a real Subsplash-derived Profile came back with
    // `email: undefined` despite the type declaring it a required string —
    // resolveAttendee threw on `.trim()` instead of just treating it as no
    // match, crashing the whole occurrence's import.
    const result = resolveAttendee({ name: "Mark Malak", email: "mark@example.org" }, lookup);
    expect(result).toEqual({ status: "matched", profileId: "p-mark-malak-b", isChild: false });
    const noMatch = resolveAttendee({ name: "Mark Malak", email: "nobody@example.org" }, lookup);
    expect(noMatch).toEqual({ status: "unmatched" });
  });

  it("leaves a name with no directory match unmatched, even with an email", () => {
    // A real Subsplash quirk (see ADR-0021): a child's exported email column
    // is often the guardian's, not the child's own. If the attendee's name
    // doesn't match anyone, that guardian's email must NOT cause a match —
    // it would silently attribute this attendance to the wrong person.
    const result = resolveAttendee(
      { name: "Totally Unknown Visitor", email: "heidi_guirguis@yahoo.com" },
      lookup
    );
    expect(result).toEqual({ status: "unmatched" });
  });

  it("matches a child by name even when their email column is actually the guardian's", () => {
    const result = resolveAttendee({ name: "Sofia Guirguis", email: "heidi_guirguis@yahoo.com" }, lookup);
    expect(result).toEqual({ status: "matched", profileId: "p-sofia-guirguis", isChild: true });
  });
});

describe("resolveDropOffAdult", () => {
  it("matches the drop-off adult by their own email", () => {
    const result = resolveDropOffAdult(
      { name: "Sofia Guirguis", droppedOffByEmail: "heidi_guirguis@yahoo.com" },
      lookup
    );
    expect(result).toEqual({ profileId: "p-heidi-guirguis" });
  });

  it("falls back to a unique name match when no email is given", () => {
    const result = resolveDropOffAdult({ name: "Sofia Guirguis", droppedOffByName: "Heidi Guirguis" }, lookup);
    expect(result).toEqual({ profileId: "p-heidi-guirguis" });
  });

  it("returns null when neither is given or neither resolves", () => {
    expect(resolveDropOffAdult({ name: "Sofia Guirguis" }, lookup)).toBeNull();
    expect(resolveDropOffAdult({ name: "Sofia Guirguis", droppedOffByName: "Nobody Known" }, lookup)).toBeNull();
  });
});

describe("resolveOccurrence", () => {
  it("resolves by a real Subsplash event id", async () => {
    const [series] = await listSeries();
    const resolved = await resolveOccurrence({
      subsplashEventId: series.representativeEventId,
      occurrenceDate: "2026-01-04",
    });
    expect(resolved).toEqual({
      status: "resolved",
      seriesId: series.seriesId,
      eventId: series.representativeEventId,
    });
  });

  it("resolves by event title, case-insensitively, when no id is given", async () => {
    const [series] = await listSeries();
    const resolved = await resolveOccurrence({
      eventTitle: series.title.toUpperCase(),
      occurrenceDate: "2026-01-04",
    });
    expect(resolved).toEqual({ status: "resolved", seriesId: series.seriesId, eventId: series.seriesId });
  });

  it("falls back to title matching when the given event id doesn't resolve", async () => {
    const [series] = await listSeries();
    const resolved = await resolveOccurrence({
      subsplashEventId: "event-id-that-does-not-exist",
      eventTitle: series.title,
      occurrenceDate: "2026-01-04",
    });
    expect(resolved).toEqual({ status: "resolved", seriesId: series.seriesId, eventId: series.seriesId });
  });

  it("returns not_found when neither id nor title resolves to a known series", async () => {
    const resolved = await resolveOccurrence({
      eventTitle: "Some Event Nobody Has Heard Of",
      occurrenceDate: "2026-01-04",
    });
    expect(resolved).toEqual({ status: "not_found" });
  });

  it("resolves a repeating-event/series id passed as --event-id, with no title given", async () => {
    // Regression: --event-id previously only tried getEvent() (a concrete
    // Subsplash event lookup), so passing a repeating-event/series id
    // directly — exactly what an operator has after being told "this title
    // is ambiguous, use --event-id with one of these ids" — failed with
    // "could not resolve", even though the id was completely valid, just in
    // a different id space (series vs. concrete event).
    const [series] = await listSeries();
    const resolved = await resolveOccurrence({
      subsplashEventId: series.seriesId,
      occurrenceDate: "2026-01-04",
    });
    expect(resolved).toEqual({ status: "resolved", seriesId: series.seriesId, eventId: series.seriesId });
  });
});

describe("findSeriesByTitle", () => {
  // Regression: confirmed against the real org that Subsplash can have two
  // distinct repeating-event series sharing the exact same title (an old
  // series retired in favor of a same-named replacement). resolveOccurrence
  // used to take the first title match without checking for this — which
  // silently placed a real import's attendance under the *stale* series;
  // the live series' report showed nothing, and nothing ever errored to
  // reveal why. This is the piece of logic responsible for catching it now.
  const SERIES = [
    { seriesId: "old-arlington-ss", title: "Sunday School [Arlington]" },
    { seriesId: "new-arlington-ss", title: "Sunday School [Arlington]" },
    { seriesId: "liturgy", title: "LITURGY" },
  ];

  it("returns every series matching the title, case/whitespace-insensitively", () => {
    expect(findSeriesByTitle(SERIES, "  sunday school [arlington] ")).toEqual([
      { seriesId: "old-arlington-ss", title: "Sunday School [Arlington]" },
      { seriesId: "new-arlington-ss", title: "Sunday School [Arlington]" },
    ]);
  });

  it("returns exactly one match for an unambiguous title", () => {
    expect(findSeriesByTitle(SERIES, "liturgy")).toEqual([{ seriesId: "liturgy", title: "LITURGY" }]);
  });

  it("returns an empty array for a title with no match", () => {
    expect(findSeriesByTitle(SERIES, "Nothing Like This Exists")).toEqual([]);
  });
});

describe("importOccurrence", () => {
  it("records a matched attendee under their real profile id, and an unmatched one as a guest", async () => {
    const [series] = await listSeries();
    const occurrenceDate = "2031-03-02"; // far-future date unlikely to collide with any seed/prior test data

    const result = await importOccurrence(
      {
        eventTitle: series.title,
        occurrenceDate,
        attendees: [
          { name: "Lily Doe", subsplashProfileId: "p-lily-child" },
          { name: "A Visiting Family" },
        ],
      },
      lookup,
      "subsplash"
    );

    expect(result).toMatchObject({
      seriesId: series.seriesId,
      matched: 1,
      unmatched: 1,
      unmatchedNames: ["A Visiting Family"],
      error: null,
    });

    const records = await listCheckIns(series.seriesId, occurrenceDate);
    expect(records).toHaveLength(2);

    const matchedRecord = records.find((r) => r.profileId === "p-lily-child");
    expect(matchedRecord).toMatchObject({ isGuest: false, isChild: true, method: "subsplash" });

    const guestRecord = records.find((r) => r.isGuest);
    expect(guestRecord).toMatchObject({ displayName: "A Visiting Family", method: "subsplash", isChild: false });
  });

  it("records check-out time, match code, and the resolved drop-off adult from a real-shaped export row", async () => {
    const [series] = await listSeries();
    const occurrenceDate = "2031-04-06";

    await importOccurrence(
      {
        eventTitle: series.title,
        occurrenceDate,
        attendees: [
          {
            name: "Sofia Guirguis",
            email: "heidi_guirguis@yahoo.com", // the guardian's email, per the real export quirk
            sessionName: "ARL (9th-12th) The Wave High School (New)",
            checkedInAt: "2026-08-02T11:19:51-04:00",
            checkedOutAt: "2026-08-02T12:48:28-04:00",
            matchCode: "HRMR",
            droppedOffByName: "Heidi Guirguis",
            droppedOffByEmail: "heidi_guirguis@yahoo.com",
          },
        ],
      },
      lookup,
      "subsplash"
    );

    const [record] = await listCheckIns(series.seriesId, occurrenceDate);
    expect(record).toMatchObject({
      profileId: "p-sofia-guirguis",
      isGuest: false,
      matchCode: "HRMR",
      droppedOffByProfileId: "p-heidi-guirguis",
      droppedOffByName: "Heidi Guirguis",
    });
    expect(record.checkedInAt).toBe(new Date("2026-08-02T11:19:51-04:00").toISOString());
    expect(record.checkedOutAt).toBe(new Date("2026-08-02T12:48:28-04:00").toISOString());
  });

  it("drops an anomalous check-out time that precedes check-in, instead of failing the import", async () => {
    // Regression: confirmed against real Subsplash data that check-out can
    // genuinely be logged a few seconds *before* check-in (a volunteer's
    // double-tap at the kiosk is the likely cause). The DB's
    // check_ins_checkout_order_check constraint enforces checkedOutAt >=
    // checkedInAt, so passing this straight through crashed the whole
    // occurrence's import (a DrizzleQueryError, not a caught, per-attendee
    // failure) — including every other attendee in the same batch.
    const [series] = await listSeries();
    const occurrenceDate = "2031-04-13";

    const result = await importOccurrence(
      {
        eventTitle: series.title,
        occurrenceDate,
        attendees: [
          {
            name: "Lily Doe",
            subsplashProfileId: "p-lily-child",
            checkedInAt: "2026-02-08T11:33:59-05:00",
            checkedOutAt: "2026-02-08T11:33:35-05:00", // 24s before check-in
          },
        ],
      },
      lookup,
      "subsplash"
    );

    expect(result.error).toBeNull();
    const [record] = await listCheckIns(series.seriesId, occurrenceDate);
    expect(record.checkedInAt).toBe(new Date("2026-02-08T11:33:59-05:00").toISOString());
    expect(record.checkedOutAt).toBeNull();
  });

  it("is idempotent — re-importing the same matched attendee updates rather than duplicates", async () => {
    const [series] = await listSeries();
    const occurrenceDate = "2031-03-09";
    const occurrence = {
      eventTitle: series.title,
      occurrenceDate,
      attendees: [{ name: "Lily Doe", subsplashProfileId: "p-lily-child" }],
    };

    await importOccurrence(occurrence, lookup, "subsplash");
    await importOccurrence(occurrence, lookup, "subsplash");

    const records = await listCheckIns(series.seriesId, occurrenceDate);
    expect(records).toHaveLength(1);
  });

  it("is idempotent for an unmatched attendee too — re-importing updates the same guest row, not a duplicate", async () => {
    // Regression test: an earlier version generated a random crypto.randomUUID()
    // guest id per import run, so re-importing the same unmatched person (which
    // the daily-cron-plus-lookback design does on purpose, re-covering
    // overlapping dates) silently duplicated them on every run instead of
    // updating one row.
    const [series] = await listSeries();
    const occurrenceDate = "2031-03-30";
    const occurrence = {
      eventTitle: series.title,
      occurrenceDate,
      attendees: [{ name: "A Visiting Family", email: "visiting@example.org" }],
    };

    await importOccurrence(occurrence, lookup, "subsplash");
    await importOccurrence(occurrence, lookup, "subsplash");

    const records = await listCheckIns(series.seriesId, occurrenceDate);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ isGuest: true, displayName: "A Visiting Family" });
  });

  it("gives the same unmatched attendee the same guest profile id across different occurrence dates", async () => {
    // Regression test: an earlier version seeded the guest id with
    // occurrenceDate, so the same recurring unmatched person got a *different*
    // synthetic profile id every week. summarizeSeriesFrequency and
    // findAbsentees group check-ins by profile_id within a series, so that
    // fragmented one real person's attendance into a separate "person" per
    // occurrence — the Series report showed several rows for the same name,
    // each stuck at 1 occurrence attended, instead of one row with their real
    // count.
    const [series] = await listSeries();
    const attendee = { name: "Repeat Visitor", email: "repeat@example.org" };

    await importOccurrence(
      { eventTitle: series.title, occurrenceDate: "2031-05-04", attendees: [attendee] },
      lookup,
      "subsplash"
    );
    await importOccurrence(
      { eventTitle: series.title, occurrenceDate: "2031-05-11", attendees: [attendee] },
      lookup,
      "subsplash"
    );

    const weekOneRecords = await listCheckIns(series.seriesId, "2031-05-04");
    const weekTwoRecords = await listCheckIns(series.seriesId, "2031-05-11");
    const weekOne = weekOneRecords.find((r) => r.displayName === "Repeat Visitor");
    const weekTwo = weekTwoRecords.find((r) => r.displayName === "Repeat Visitor");
    expect(weekOne?.isGuest).toBe(true);
    expect(weekOne?.profileId).toBe(weekTwo?.profileId);
  });

  it("records a failed run (with no check-ins written) when the occurrence can't be resolved", async () => {
    const result = await importOccurrence(
      {
        eventTitle: "Nonexistent Series",
        occurrenceDate: "2031-03-16",
        attendees: [{ name: "Someone" }],
      },
      lookup,
      "subsplash"
    );

    expect(result.seriesId).toBeNull();
    expect(result.error).toContain("Nonexistent Series");
    expect(result.unmatched).toBe(1);
  });
});

describe("lastImportRunForSeries", () => {
  it("returns the most recent run for a series", async () => {
    const [series] = await listSeries();
    const occurrenceDate = "2031-03-23";
    await importOccurrence(
      {
        eventTitle: series.title,
        occurrenceDate,
        attendees: [{ name: "Lily Doe", subsplashProfileId: "p-lily-child" }],
      },
      lookup,
      "subsplash"
    );

    const run = await lastImportRunForSeries(series.seriesId);
    expect(run).not.toBeNull();
    expect(run?.seriesId).toBe(series.seriesId);
    expect(run?.rowsMatched).toBeGreaterThanOrEqual(1);
  });

  it("returns null for a series with no import history", async () => {
    const run = await lastImportRunForSeries("series-with-no-history-ever");
    expect(run).toBeNull();
  });
});
