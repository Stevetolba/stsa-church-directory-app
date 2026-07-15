# ADR-0013: Parent contacts in child export & suggested filter presets

**Status:** Accepted
**Date:** 2026-07-15

## Context

Two staff-facing gaps in the Children and Youth workflow:

1. The Children CSV export listed each child on their own row with no way to reach a parent/guardian without opening the household separately — a real friction point when the export is handed to a coach or classroom volunteer.
2. Both the People and Children list pages already support ad-hoc filtering (ADR from the filter-pill redesign), but staff repeatedly reconstruct the same combinations by hand — e.g. "Arlington Members" or "Leesburg KATW (K–2nd)" — which map to real ministry groups.

## Decision

### Parent contacts in the child export

`attachParentContacts` (`lib/subsplash.ts`) resolves, for each child in a result set, up to two parent/guardian profiles sharing the child's `household_id` (`household_role` of `guardian` or `parent`, sorted by name for determinism), and reuses the already-cached `allProfiles()` walk (ADR-0009) — no additional Subsplash calls. `GET /api/children` accepts `includeParents=true`, only ever sent by the CSV export path, which attaches `parent1`/`parent2` and adds six columns (`CHILD_EXPORT_COLUMNS` in `lib/csv.ts`: name/phone/email × 2) alongside the existing profile columns.

This is **not a new exposure boundary**: a volunteer who can already open a child's profile can already see that child's parents via the household (`profileVisibleToVolunteer`, ADR-0011). Bundling the same contact fields into the export row is a convenience, not a widening of access. Export itself remains gated on `hasActiveFilter`, unchanged from the existing export feature.

### Suggested filter presets

`SuggestedFilters` (`components/SuggestedFilters.tsx`) is a collapsible panel, generic over a preset shape `T`, that renders a row of pill buttons and calls back with the clicked preset — it owns no filter logic itself, so both list pages can reuse it with their own params:

- **People page:** four presets (Arlington/Leesburg × Members/Regular Attendees) setting `campus` + `status`.
- **Children page:** eleven presets covering both campuses' High School, Middle School, KATW tiers, and Tim's Tots, each setting `campus` + a `gradeFrom`/`gradeTo` range per `lib/grades.ts`'s `GRADE_LEVELS`.

Clicking a preset fully replaces `campus`/`status` (People) or `campus`/`grade` (Children) with the preset's values — it's a "jump to this ministry group" shortcut, not a merge with whatever was already selected — while leaving Search/other dimensions untouched so a preset can still be combined with them. This matches how `updateParams` already works (`params.set`, not append), so no new param-merging logic was needed.

**Tim's Tots mapping:** "3-5 years old and Pre-K" maps to **Pre-K only** (`gradeFrom = gradeTo = 1`, the youngest grade level the app models). Kids younger than Pre-K age typically have no `academic_grade_value` recorded in Subsplash at all, so there's no lower tier this filter can express without changing the Grade filter's general semantics — deliberately out of scope here, confirmed with the user.

## Consequences

- Both features are additive UI/export conveniences over existing, already-scoped data paths — no new access-control surface, no new Subsplash endpoints.
- The suggested-filter preset lists are hardcoded to the church's current ministry-group names and grade boundaries; renaming a ministry group or changing a grade cutoff means editing `SUGGESTED_FILTERS` in the relevant page, not a config file. Acceptable for now given how infrequently these groups change.
