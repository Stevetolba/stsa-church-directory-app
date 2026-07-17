// Pure time helpers for events/check-in (ADR-0015). No I/O — unit-tested in
// lib/eventTime.test.ts and shared by lib/events.ts, lib/mockData.ts, and the
// UI, so the check-in window is defined in exactly one place.

// Check-in opens 45 min before start_at; check-out stays open until 45 min
// after end_at (pickup runs past the event's end). Both the live check-in POST
// and the check-out PATCH are gated by this same window server-side; a
// staff/admin "backfill" bypasses it.
export const CHECK_IN_OPENS_BEFORE_MS = 45 * 60 * 1000;
export const CHECK_OUT_CLOSES_AFTER_MS = 45 * 60 * 1000;

export interface EventTimes {
  start_at: string;
  end_at?: string;
}

export interface CheckInWindow {
  opensAt: Date;
  closesAt: Date;
}

export function checkInWindow(event: EventTimes): CheckInWindow {
  const start = new Date(event.start_at).getTime();
  // A missing end_at (all-day / point events) falls back to start_at, so the
  // window is still well-defined.
  const end = event.end_at ? new Date(event.end_at).getTime() : start;
  return {
    opensAt: new Date(start - CHECK_IN_OPENS_BEFORE_MS),
    closesAt: new Date(end + CHECK_OUT_CLOSES_AFTER_MS),
  };
}

export type WindowState = "upcoming" | "open" | "closed";

export function windowState(event: EventTimes, now: Date = new Date()): WindowState {
  const { opensAt, closesAt } = checkInWindow(event);
  const t = now.getTime();
  if (t < opensAt.getTime()) return "upcoming";
  if (t > closesAt.getTime()) return "closed";
  return "open";
}

// Whether a live check-in (or check-out) is permitted right now — i.e. within
// the window. Backfill callers bypass this.
export function isWithinCheckInWindow(event: EventTimes, now: Date = new Date()): boolean {
  return windowState(event, now) === "open";
}

// Event-local calendar date (YYYY-MM-DD) of an instant — the attendance
// occurrence key. en-CA formats as an ISO date; timeZone shifts the instant
// into the event's zone first (so a 9am America/New_York service lands on the
// right day regardless of the server's own timezone).
export function occurrenceDateInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// A short local time label like "9:15 AM" in the event's timezone, for window
// chips ("Opens 9:15 AM").
export function timeLabelInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

// The inverse of occurrenceDateInTz: given wall-clock Y/M/D/H/M/S in an IANA
// zone, find the UTC instant that displays as those numbers there — correctly
// DST-adjusted. JS has no direct API for this, so it uses the standard
// double-conversion trick: guess the instant is UTC, ask Intl what that
// guess looks like in timeZone, then correct by the difference. Used to turn
// a repeating event's literal wall-clock recurrence (from its RRULE) into a
// real instant (lib/recurrence.ts) without depending on rrule's own
// (nonexistent) IANA timezone support.
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Intl renders midnight as hour "24" rather than "00" with hour12: false.
  const hourPart = get("hour") % 24;
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hourPart, get("minute"), get("second"));
  return new Date(guess.getTime() - (asIfUtc - guess.getTime()));
}
