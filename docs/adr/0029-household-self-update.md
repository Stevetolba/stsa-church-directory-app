# ADR-0029: Household self-update with admin review

**Status:** Accepted
**Date:** 2026-11-04

## Context
Families want to correct their own directory data (names, birth dates, address, a child's grade) and add a new family member, without staff retyping it. Subsplash is the system of record, so nothing a family types may be written there until an admin has seen it.

## Decision
- **Sign-in:** a parent or guardian enters their email at `/household-update/login` and gets a 6-digit code (same mechanics as ADR-0025: hashed code, 10 min expiry, 5 wrong guesses, 5 codes/hour). Only profiles with `household_role` `guardian` or `parent` in a household are eligible; children and "other" members are not. `login_codes.purpose` (`training` | `household`) keeps the two kinds of code from being used interchangeably, and rate limits are counted per purpose.
- **Separate session, not NextAuth.** The household session is an HMAC-signed httpOnly cookie (`lib/householdSession.ts`, 2h) read only by `/household-update` pages and their server actions. Several existing API routes accept "any signed-in user", so putting household visitors in the NextAuth session would have exposed directory data; as a separate cookie they are simply signed out everywhere else. The household id is taken from the cookie, never from a URL or form field.
- **Proposals, not writes.** Changes are saved per field in `household_update_changes` under one open request per household (`household_update_requests`, unique while `draft`/`pending`). Each row keeps the value Subsplash had when the family proposed it. Only real differences are stored; typing a value back to the original removes the row.
- **Scope of editing:** adults: first name, last name, date of birth. Children: the same plus grade. The address is one household-level edit (Subsplash keeps it on the household). A date of birth can be corrected but not cleared. No custom fields are exposed.
- **Grade** is calculated by Subsplash from `graduation_year`, so a grade correction is saved and written as a graduation year (`lib/grades.ts`; the school year rolls over on August 1). The review screen shows both the grade and the year.
- **New members** are proposed as a unit and created with `POST /people/v1/profiles` (`createProfile`) only after an admin accepts them. The review screen warns about likely duplicates (same last name plus first name or birth date).
- **Admin review** (`/settings/household-updates`): three columns (at submission / Subsplash now / proposed), a "changed since" badge when Subsplash moved after the proposal, a checkbox per field (new members are one unit), then Apply, Reject all, or Retry failed. Writes go through the existing `updateProfile` / `updateHousehold`. Each change records `applied_at` or `apply_error`; a failed write leaves the request pending and a retry skips what already succeeded.
- **Audit and email:** page views and submissions are logged to `access_events` (role `household`); admins listed in `ADMIN_EMAILS` are emailed on submission and the household is emailed the outcome.

## Consequences
- A code only proves someone can read that inbox. If an old email is still on a Subsplash profile, its owner can see that household's names, birth dates and address. The mitigations are the guardian-only rule, the 2h session, no custom fields, and admin review of everything written.
- Two admins applying the same request at the same moment could both try to create a new member; the unique-per-request design and the duplicate warning make this unlikely but there is no row lock.
- `createProfile` follows the OpenAPI spec but has not been exercised against the live Subsplash API; try it with one real new member first.
- The grade-to-graduation-year conversion assumes an August 1 rollover; if Subsplash rolls over on another date, the review screen's "Subsplash now" column will show the mismatch.
- Requires migration `0013_household_updates` before deploying.
