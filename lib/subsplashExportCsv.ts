// Parses a Subsplash Check-In attendee export (ADR-0021) into the shape
// POST /api/attendance/import expects. Confirmed against two real exports
// pulled from the live dashboard — a single-occurrence detail export and a
// multi-date "All Check-ins" range export — which turn out to differ in two
// ways this parser has to absorb:
//   - Header casing: "First Name" vs "First name", "Check-out Time" vs
//     "Check-out time". Headers are matched case/whitespace-insensitively.
//   - Date/time shape: the single-occurrence export's "Event Date" and
//     "Check-in time" columns are both full datetimes ("August 2, 2026 at
//     11:30:00 am EDT"); the range export's "Event Date" is a bare date
//     ("August 16, 2026") and "Check-in time" is a bare time ("11:45:46 am
//     EDT"), meant to be combined with Event Date. "Check-out time" is a
//     full datetime in both. This parser handles all three shapes uniformly.
//
// Subsplash's own export never states which series/event a file belongs to
// (no such column in either sample) — the caller must supply eventTitle
// (or a Subsplash event id), since the sync script already knows which
// series it just exported.

import { zonedWallTimeToUtc } from "./eventTime";
import type { AttendanceImportAttendee, AttendanceImportOccurrence } from "./validation/attendance";

// --- Minimal RFC 4180 CSV reader (no library — the app only ever writes CSV
// today, via lib/csv.ts; reading one is a small, self-contained addition). ---

export function parseCsvRows(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyField = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    sawAnyField = false;
  };

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAnyField = true;
      continue;
    }
    if (c === ",") {
      endField();
      sawAnyField = true;
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      if (sawAnyField || field.length > 0) endRow();
      continue;
    }
    field += c;
    sawAnyField = true;
  }
  if (sawAnyField || field.length > 0) endRow();

  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

// Canonical field -> the (already-normalized) header text(s) that name it
// across the export variants seen so far.
const HEADER_ALIASES: Record<string, string[]> = {
  eventDate: ["event date"],
  checkInTime: ["check-in time"],
  session: ["session"],
  firstName: ["[checked in] first name"],
  lastName: ["[checked in] last name"],
  email: ["[checked in] email"],
  securityCode: ["security code"],
  grade: ["[checked in] grade"],
  droppedOffFirstName: ["[checked in by] first name"],
  droppedOffLastName: ["[checked in by] last name"],
  droppedOffEmail: ["[checked in by] email"],
  checkOutTime: ["check-out time"],
};

function buildHeaderIndex(headerRow: string[]): Map<string, number> {
  const normalized = headerRow.map(normalizeHeader);
  const index = new Map<string, number>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const col = normalized.findIndex((h) => aliases.includes(h));
    if (col !== -1) index.set(field, col);
  }
  return index;
}

// --- Date/time parsing ---

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

interface DateTimeParts {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

function to24Hour(hour12: number, ampm: string): number {
  const isPm = ampm.toLowerCase() === "pm";
  if (hour12 === 12) return isPm ? 12 : 0;
  return isPm ? hour12 + 12 : hour12;
}

// Handles all three shapes Subsplash exports: a full datetime ("August 2,
// 2026 at 11:30:00 am EDT"), a bare date ("August 16, 2026"), or a bare time
// ("11:45:46 am EDT"). The trailing timezone abbreviation (EDT/EST) is
// intentionally ignored — it's not reliably parseable across JS engines, and
// unnecessary anyway: the caller combines these wall-clock parts with the
// org's known IANA timezone via zonedWallTimeToUtc, which handles DST
// correctly without trusting the abbreviation.
export function parseSubsplashDateTime(raw: string | undefined | null): DateTimeParts | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  const withDate = text.match(
    /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s+at\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm))?/i
  );
  if (withDate) {
    const month = MONTHS[withDate[1].toLowerCase()];
    if (!month) return null;
    const day = Number(withDate[2]);
    const year = Number(withDate[3]);
    if (withDate[4] === undefined) {
      return { year, month, day };
    }
    return {
      year,
      month,
      day,
      hour: to24Hour(Number(withDate[4]), withDate[7]),
      minute: Number(withDate[5]),
      second: withDate[6] ? Number(withDate[6]) : 0,
    };
  }

  const timeOnly = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeOnly) {
    return {
      hour: to24Hour(Number(timeOnly[1]), timeOnly[4]),
      minute: Number(timeOnly[2]),
      second: timeOnly[3] ? Number(timeOnly[3]) : 0,
    };
  }

  return null;
}

// Combines a date-bearing parse and an optional time-bearing parse (the
// range export's split Event Date / Check-in time columns) into a real UTC
// instant. Returns null if no usable date is present at all.
function toIsoInstant(dateParts: DateTimeParts | null, timeParts: DateTimeParts | null, timeZone: string): string | null {
  const year = dateParts?.year;
  const month = dateParts?.month;
  const day = dateParts?.day;
  if (year === undefined || month === undefined || day === undefined) return null;
  const hour = timeParts?.hour ?? dateParts?.hour ?? 0;
  const minute = timeParts?.minute ?? dateParts?.minute ?? 0;
  const second = timeParts?.second ?? dateParts?.second ?? 0;
  return zonedWallTimeToUtc(year, month, day, hour, minute, second, timeZone).toISOString();
}

function occurrenceDateOf(dateParts: DateTimeParts | null): string | null {
  if (dateParts?.year === undefined || dateParts.month === undefined || dateParts.day === undefined) return null;
  return `${dateParts.year}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")}`;
}

// Subsplash prints "-" for a checked-in-by adult with no last name on file
// (observed on a teen who checks themself in). Not a real name segment.
function cleanNamePart(part: string | undefined): string {
  const trimmed = (part ?? "").trim();
  return trimmed === "-" ? "" : trimmed;
}

function joinName(first: string | undefined, last: string | undefined): string {
  return [cleanNamePart(first), cleanNamePart(last)].filter(Boolean).join(" ").trim();
}

function cell(row: string[], index: Map<string, number>, field: string): string | undefined {
  const col = index.get(field);
  if (col === undefined) return undefined;
  const value = row[col];
  return value !== undefined && value.trim() !== "" ? value.trim() : undefined;
}

export interface ParseSubsplashCsvOptions {
  timeZone: string;
  // Attached to every occurrence produced — the CSV itself never names its
  // own series/event (see module comment).
  eventTitle?: string;
  subsplashEventId?: string;
}

export interface ParsedRowIssue {
  rowNumber: number; // 1-indexed, header excluded
  reason: string;
}

export interface ParseSubsplashCsvResult {
  occurrences: AttendanceImportOccurrence[];
  // Rows that couldn't be parsed at all (unrecognized date, no attendee
  // name) — surfaced separately from "unmatched" (a parseable row that just
  // doesn't match a directory profile, handled downstream in
  // lib/attendanceImport.ts). A malformed row is dropped, not guessed at.
  skipped: ParsedRowIssue[];
}

// Parses a full export into POST-ready occurrences, grouped by calendar
// date (a range export spans many Sundays; a single-occurrence export
// happens to produce exactly one group).
export function parseSubsplashCheckInsCsv(csvText: string, options: ParseSubsplashCsvOptions): ParseSubsplashCsvResult {
  const rows = parseCsvRows(csvText);
  const skipped: ParsedRowIssue[] = [];
  if (rows.length === 0) return { occurrences: [], skipped };

  const index = buildHeaderIndex(rows[0]);
  const byOccurrenceDate = new Map<string, AttendanceImportAttendee[]>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 1 && row[0].trim() === "") continue; // trailing blank line
    const rowNumber = i; // header already excluded

    const eventDateParts = parseSubsplashDateTime(cell(row, index, "eventDate"));
    const occurrenceDate = occurrenceDateOf(eventDateParts);
    if (!occurrenceDate) {
      skipped.push({ rowNumber, reason: "Unparseable or missing Event Date" });
      continue;
    }

    const name = joinName(cell(row, index, "firstName"), cell(row, index, "lastName"));
    if (!name) {
      skipped.push({ rowNumber, reason: "Missing checked-in person's name" });
      continue;
    }

    const checkInParts = parseSubsplashDateTime(cell(row, index, "checkInTime"));
    const checkedInAt = toIsoInstant(eventDateParts, checkInParts, options.timeZone) ?? undefined;

    const checkOutRaw = cell(row, index, "checkOutTime");
    const checkOutParts = parseSubsplashDateTime(checkOutRaw);
    const checkedOutAt = checkOutRaw ? (toIsoInstant(checkOutParts, null, options.timeZone) ?? undefined) : undefined;

    const grade = cell(row, index, "grade");
    const droppedOffByName = joinName(cell(row, index, "droppedOffFirstName"), cell(row, index, "droppedOffLastName"));

    const attendee: AttendanceImportAttendee = {
      name,
      email: cell(row, index, "email"),
      sessionName: cell(row, index, "session"),
      checkedInAt,
      checkedOutAt,
      // Grade is the only signal the export carries toward child vs. adult —
      // used only as a fallback for an attendee who ends up unmatched (a
      // matched attendee's isChild comes from their real directory profile
      // instead; see lib/attendanceImport.ts).
      isChild: grade !== undefined ? true : undefined,
      droppedOffByName: droppedOffByName || undefined,
      droppedOffByEmail: cell(row, index, "droppedOffEmail"),
      matchCode: cell(row, index, "securityCode"),
    };

    const list = byOccurrenceDate.get(occurrenceDate) ?? [];
    list.push(attendee);
    byOccurrenceDate.set(occurrenceDate, list);
  }

  const occurrences: AttendanceImportOccurrence[] = Array.from(byOccurrenceDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([occurrenceDate, attendees]) => ({
      occurrenceDate,
      eventTitle: options.eventTitle,
      subsplashEventId: options.subsplashEventId,
      attendees,
    }));

  return { occurrences, skipped };
}
