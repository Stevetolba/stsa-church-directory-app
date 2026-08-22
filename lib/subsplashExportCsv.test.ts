import { describe, expect, it } from "vitest";
import { parseCsvRows, parseSubsplashCheckInsCsv, parseSubsplashDateTime } from "./subsplashExportCsv";

const TZ = "America/New_York";

describe("parseCsvRows", () => {
  it("handles quoted fields containing commas, and escaped quotes", () => {
    const csv = 'a,b,c\n"August 2, 2026 at 11:30:00 am EDT",plain,"has ""quotes"" inside"\n';
    expect(parseCsvRows(csv)).toEqual([
      ["a", "b", "c"],
      ["August 2, 2026 at 11:30:00 am EDT", "plain", 'has "quotes" inside'],
    ]);
  });

  it("ignores a trailing blank line", () => {
    const csv = "a,b\n1,2\n";
    expect(parseCsvRows(csv)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseSubsplashDateTime", () => {
  it("parses a full datetime (single-occurrence export shape)", () => {
    expect(parseSubsplashDateTime("August 2, 2026 at 11:30:00 am EDT")).toEqual({
      year: 2026,
      month: 8,
      day: 2,
      hour: 11,
      minute: 30,
      second: 0,
    });
  });

  it("parses noon and midnight correctly (12-hour edge cases)", () => {
    expect(parseSubsplashDateTime("August 2, 2026 at 12:00:00 pm EDT")).toMatchObject({ hour: 12 });
    expect(parseSubsplashDateTime("August 2, 2026 at 12:15:00 am EDT")).toMatchObject({ hour: 0 });
  });

  it("parses a bare date (range export's Event Date column)", () => {
    expect(parseSubsplashDateTime("August 16, 2026")).toEqual({ year: 2026, month: 8, day: 16 });
  });

  it("parses a bare time (range export's Check-in time column)", () => {
    expect(parseSubsplashDateTime("11:45:46 am EDT")).toEqual({ hour: 11, minute: 45, second: 46 });
  });

  it("returns null for empty or unrecognized input", () => {
    expect(parseSubsplashDateTime("")).toBeNull();
    expect(parseSubsplashDateTime(undefined)).toBeNull();
    expect(parseSubsplashDateTime("not a date")).toBeNull();
  });
});

// Mirrors the real single-occurrence detail export's exact header/format
// shape: full datetimes throughout, "First Name"/"Last Name" casing.
const SINGLE_OCCURRENCE_CSV = [
  "Event Date,Check-in time,Session,[Checked in] First Name,[Checked in] Last Name,[Checked in] Gender,[Checked in] Age,[Checked in] Grade,[Checked in] Email,[Checked in] Phone,Security Code,[Checked in by] First Name,[Checked in by] Last Name,[Checked in by] Email,[Checked in by] Phone,Check-out Time",
  '"August 2, 2026 at 11:30:00 am EDT","August 2, 2026 at 11:19:51 am EDT",ARL (K-1st) Class,Ana,Fictional,female,6,1st,parent.fictional@example.org,15551234567,AB12,Pat,Fictional,parent.fictional@example.org,15551234567,"August 2, 2026 at 12:48:28 pm EDT"',
  // A self-checked-in teen with no "checked in by" last name on file.
  '"August 2, 2026 at 11:30:00 am EDT","August 2, 2026 at 11:21:23 am EDT",ARL (9th-12th) Class,Sam,Teenager,male,,,,,Y2R6,Sam,-,samteen@example.org,15557654321,',
].join("\n");

// Mirrors the real "All Check-ins" range export's shape: bare Event Date +
// bare Check-in time, lowercase "First name"/"Last name"/"Check-out time".
const RANGE_CSV = [
  "Event Date,Check-in time,Session,[Checked in] First Name,[Checked in] Last Name,[Checked in] Gender,[Checked in] Age,[Checked in] Grade,[Checked in] Email,[Checked in] Phone,Security Code,[Checked in by] First name,[Checked in by] Last name,[Checked in by] Email,[Checked in by] Phone,Check-out time",
  '"August 16, 2026",11:45:46 am EDT,ARL (2nd-3rd) Class,Ben,Fictional,male,9,2nd,,,FMPG,Pat,Fictional,parent.fictional@example.org,15551234567,"August 16, 2026 at 12:38:53 pm EDT"',
  '"August 9, 2026",10:02:11 am EDT,ARL (2nd-3rd) Class,Ben,Fictional,male,9,2nd,,,QQ11,Pat,Fictional,parent.fictional@example.org,15551234567,',
].join("\n");

describe("parseSubsplashCheckInsCsv", () => {
  it("parses the single-occurrence export shape, converting local wall time to a correct UTC instant", () => {
    const { occurrences, skipped } = parseSubsplashCheckInsCsv(SINGLE_OCCURRENCE_CSV, {
      timeZone: TZ,
      eventTitle: "Sunday School — Arlington",
    });

    expect(skipped).toEqual([]);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].occurrenceDate).toBe("2026-08-02");
    expect(occurrences[0].eventTitle).toBe("Sunday School — Arlington");
    expect(occurrences[0].attendees).toHaveLength(2);

    const ana = occurrences[0].attendees.find((a) => a.name === "Ana Fictional")!;
    expect(ana.checkedInAt).toBe("2026-08-02T15:19:51.000Z"); // 11:19:51 EDT = UTC-4
    expect(ana.checkedOutAt).toBe("2026-08-02T16:48:28.000Z");
    expect(ana.sessionName).toBe("ARL (K-1st) Class");
    expect(ana.matchCode).toBe("AB12");
    expect(ana.droppedOffByName).toBe("Pat Fictional");
    expect(ana.droppedOffByEmail).toBe("parent.fictional@example.org");

    const sam = occurrences[0].attendees.find((a) => a.name === "Sam Teenager")!;
    expect(sam.checkedOutAt).toBeUndefined();
    // "-" placeholder last name is stripped, leaving just the first name.
    expect(sam.droppedOffByName).toBe("Sam");
  });

  it("parses the range export shape, combining the bare date and bare time columns", () => {
    const { occurrences, skipped } = parseSubsplashCheckInsCsv(RANGE_CSV, {
      timeZone: TZ,
      eventTitle: "Sunday School — Arlington",
    });

    expect(skipped).toEqual([]);
    expect(occurrences).toHaveLength(2); // two distinct Sundays

    const aug16 = occurrences.find((o) => o.occurrenceDate === "2026-08-16")!;
    expect(aug16.attendees[0].checkedInAt).toBe("2026-08-16T15:45:46.000Z");
    expect(aug16.attendees[0].checkedOutAt).toBe("2026-08-16T16:38:53.000Z");

    const aug9 = occurrences.find((o) => o.occurrenceDate === "2026-08-09")!;
    expect(aug9.attendees[0].checkedInAt).toBe("2026-08-09T14:02:11.000Z");
    expect(aug9.attendees[0].checkedOutAt).toBeUndefined();
  });

  it("infers isChild from a present Grade column, as a fallback signal only", () => {
    const { occurrences } = parseSubsplashCheckInsCsv(RANGE_CSV, { timeZone: TZ, eventTitle: "x" });
    expect(occurrences[0].attendees[0].isChild).toBe(true);
  });

  it("skips a row with no checked-in name rather than guessing", () => {
    const csv = [
      "Event Date,Check-in time,Session,[Checked in] First Name,[Checked in] Last Name,Security Code",
      '"August 2, 2026 at 11:30:00 am EDT","August 2, 2026 at 11:19:51 am EDT",ARL Class,,,AB12',
    ].join("\n");
    const { occurrences, skipped } = parseSubsplashCheckInsCsv(csv, { timeZone: TZ, eventTitle: "x" });
    expect(occurrences).toHaveLength(0);
    expect(skipped).toEqual([{ rowNumber: 1, reason: "Missing checked-in person's name" }]);
  });

  it("skips a row with an unparseable Event Date rather than guessing", () => {
    const csv = [
      "Event Date,Check-in time,Session,[Checked in] First Name,[Checked in] Last Name,Security Code",
      "not a date,also not a date,ARL Class,Ana,Fictional,AB12",
    ].join("\n");
    const { occurrences, skipped } = parseSubsplashCheckInsCsv(csv, { timeZone: TZ, eventTitle: "x" });
    expect(occurrences).toHaveLength(0);
    expect(skipped).toEqual([{ rowNumber: 1, reason: "Unparseable or missing Event Date" }]);
  });

  it("returns an empty result for an empty file", () => {
    expect(parseSubsplashCheckInsCsv("", { timeZone: TZ, eventTitle: "x" })).toEqual({
      occurrences: [],
      skipped: [],
    });
  });
});
