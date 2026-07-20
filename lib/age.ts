// Parses an ISO date string (e.g. "2016-03-08") into local-date parts,
// avoiding the UTC-vs-local off-by-one-day issue `new Date(iso)` has for
// date-only strings — same technique lib/birthdays.ts uses.
function parseIsoDateParts(iso: string): { year: number; month: number; day: number } | null {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

// Age in completed years as of `asOf` (defaults to now) — subtracts one more
// year if this year's birthday hasn't happened yet, not just a year
// subtraction. Returns null for an unparseable/missing date of birth.
export function calculateAge(dateOfBirth: string, asOf: Date = new Date()): number | null {
  const parts = parseIsoDateParts(dateOfBirth);
  if (!parts) return null;

  let age = asOf.getFullYear() - parts.year;
  const hasHadBirthdayThisYear =
    asOf.getMonth() + 1 > parts.month ||
    (asOf.getMonth() + 1 === parts.month && asOf.getDate() >= parts.day);
  if (!hasHadBirthdayThisYear) age -= 1;

  return age;
}

// Age in completed months as of `asOf` — Subsplash's session min_age/max_age
// are in months, not years (confirmed against the live org: a "Pre-K-5yrs"
// session reports 36–71). Same completed-unit semantics as calculateAge, just
// months instead of years. Returns null for an unparseable/missing date of birth.
export function calculateAgeInMonths(dateOfBirth: string, asOf: Date = new Date()): number | null {
  const parts = parseIsoDateParts(dateOfBirth);
  if (!parts) return null;

  let months = (asOf.getFullYear() - parts.year) * 12 + (asOf.getMonth() + 1 - parts.month);
  if (asOf.getDate() < parts.day) months -= 1;

  return months;
}
