# ADR-0006: Member status uses Subsplash's 5-value membership taxonomy

**Status:** Accepted
**Date:** 2026-07-09

## Context

The mockup's Member List screen designs three status filter chips: Member, Regular Attendee, Visitor. Cross-referencing against `openapi.yaml`, the real data behind "membership status" is `_embedded.latest-membership-status-change.status` on a Profile, an enum of **five** values: `visitor`, `newcomer`, `regular_attender`, `member`, `former_attender`. There is no Subsplash concept that collapses cleanly to the mockup's three buckets — `newcomer` and `former_attender` are both real, distinct categories churches use.

## Decision

Use all five Subsplash values as the app's `MemberStatus` type, mapped 1:1 to display labels (`Visitor`, `Newcomer`, `Regular Attendee`, `Member`, `Former Attender`), and expand the Member List UI to five filter chips instead of the mockup's three. This deviates from the mockup's pixel-accurate chip count, but avoids silently discarding or mis-bucketing real membership data — a newcomer and a former attender are meaningfully different from a visitor or a lapsed member for office-staff purposes.

```typescript
export type MemberStatus =
  | "Visitor"
  | "Newcomer"
  | "Regular Attendee"
  | "Member"
  | "Former Attender";
```

The mapping from Subsplash's raw enum to this type lives in `lib/subsplash.ts`, in one place, so it's easy to revisit if the mapping needs to change.

## Consequences

- The Member List's filter-chip row (mockup §5) gains two chips beyond what's pixel-specified there. Visual treatment (pill style, active/inactive colors) follows the same pattern as the existing three; new badge colors for Newcomer/Former Attender need to be chosen when the card grid is built, consistent with the existing `status.active/inactive/pending` Tailwind tokens' spirit but not literally reusing them (those represent Subsplash's different `ProfileStatus` concept — see ADR-0004's amendment).
- Any profile with a `null`/unknown `latest-membership-status-change.status` (the schema allows `null`, meaning "unknown") needs a defined fallback — treated as `Visitor` in `lib/subsplash.ts`'s mapping, the least-committal bucket.

## Alternatives rejected

- **Fold newcomer → Visitor, former_attender → Regular Attendee** (collapse to the mockup's exact 3 chips). Rejected — loses real distinctions in the underlying data that office staff would reasonably want to filter on, for the sake of matching a mockup that was explicitly built with placeholder sample data.
- **Show unmapped values with no badge / an "Other" badge.** Rejected — treats real, named Subsplash categories as unknown when they aren't; actively worse than just showing the real label.
