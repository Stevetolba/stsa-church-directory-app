import { occurrenceDateInTz } from "./eventTime";

// The church's own timezone. The server runs in UTC, so anything that asks
// "what day is it?" with new Date().getDate() is a day ahead from about 7 or
// 8 PM Eastern onward; use churchToday() for calendar-day questions instead.
export const CHURCH_TIMEZONE = "America/New_York";

// Today's calendar date in the church's timezone, as a Date at local midnight
// of that Y/M/D so the usual getFullYear/getMonth/getDate math works. Only the
// date is meaningful, not the time of day.
export function churchToday(now: Date = new Date()): Date {
  const [y, m, d] = occurrenceDateInTz(now.toISOString(), CHURCH_TIMEZONE).split("-").map(Number);
  return new Date(y, m - 1, d);
}
