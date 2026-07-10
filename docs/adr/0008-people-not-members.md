# ADR-0008: The UI section is "People", not "Members"

**Status:** Accepted
**Date:** 2026-07-10

## Context

The original tech spec and mockup call the roster screen "Members" (`/members`, `MemberCard`, "Total Members", etc.). But `MemberStatus` (ADR-0006) has five values — `Member`, `Regular Attendee`, `Visitor`, `Newcomer`, `Former Attender` — and "Member" is one specific status among them, not a synonym for "a person in the directory." Calling the whole section "Members" reads as though it only contains people with `status === "Member"`, which is wrong and will confuse staff looking up a Visitor or Newcomer.

While implementing the household-role display prompted by this same conversation, a second, unrelated naming error surfaced: the mock data used `household_role` values `"head"` and `"spouse"`, which aren't real Subsplash values. The actual `HouseholdRole` enum (`openapi.yaml`) is `guardian | parent | child | other | unknown`. Both corrections landed together since they were found in the same pass.

## Decision

Renamed the roster section from "Members" to "People" throughout the UI: route (`app/(dashboard)/people/`), nav label, page heading/subtitle, dashboard stat card and action card, empty-state copy, and the "Add Person" button. Component and hook files followed (`MemberCard` → `PersonCard`, `useMembers` → `usePeople`) so the codebase doesn't have "Member"-named files backing a "People" UI.

**Deliberately not renamed:** `lib/subsplash.ts`'s `searchProfiles`/`getProfile`/`updateProfile`/`UpdateProfileInput`, and the `/api/profiles` route. These mirror Subsplash's actual API resource, which actually is called "Profile" — renaming them to "People" would misrepresent what they wrap. The status value `"Member"` itself is also untouched — it's a real, correct status a person can have, same as `"Visitor"`.

`household_role` now uses the real enum (`guardian | parent | child | other | unknown`), and `academic_grade`/`graduation_year` were added to `Profile` (Subsplash computes `academic_grade` server-side from `graduation_year`; it isn't independently stored or editable).

## Consequences

- Any future spec/mockup reference to "Members" for this section should be read as superseded by this ADR, the same way ADR-0001 supersedes the spec's original auth sections.
- `docs/adr/0002-roles-live-in-app-not-subsplash-token.md` and others use "staff"/"admin" for the auth roles, which is an unrelated concept from `household_role` and `MemberStatus` — no collision, no change needed there.
