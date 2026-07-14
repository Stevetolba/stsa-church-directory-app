# ADR-0011: Children directory and volunteer scoping

**Status:** Accepted
**Date:** 2026-07-13

## Context

ADR-0010 admitted personal-email volunteers as a read-only role, but gave them the same read access as staff: the full People and Households directories and any adult's profile. For a children's-ministry volunteer that's too much — they should see children and the immediate families of those children (to reach parents), not the whole congregation's PII. Nothing in the app enforced per-role read scope: `staff` and `volunteer` were authorization-identical, only `admin`-vs-not was enforced, and only for writes (`requireAdmin`).

## Decision

Add a **Children** directory — a clone of the People page scoped to `household_role === "child"` — and restrict volunteers to it. Staff/admin keep the full directory and also get the Children page.

The whole model rests on one predicate: a **household is child-bearing** if any member is a child (`household_role === "child"`, the authoritative marker per ADR-0006 — `academic_grade` only covers Pre-K–12th and isn't a reliable detector). For a volunteer:
- a **profile** is visible iff it is a child or shares a child-bearing household with one (so a child's parents/guardians/siblings are visible, unrelated adults are not);
- a **household** is visible iff it is child-bearing;
- the **Children list** shows only children.

Because a child's family shares the child's (child-bearing) household, the existing `/people/[id]` and `/households/[id]` detail pages already surface exactly the right records — so they're **reused** with per-record guards rather than cloned.

Enforcement is server-side in three layers (hiding nav is not a guard — ADR-0005's spirit):
1. **Middleware** (`middleware.ts`) redirects volunteers off the browse surfaces (`/`, `/people`, `/households`) to `/children`. It runs on the Edge with the providers-empty `authConfig` (no `role` on `req.auth`), so role is derived from the verified email via `resolveRole` (pure env+string, Edge-safe), which yields the same tier as the stored token. This layer is UX/defense-in-depth, so it fails **open** — it redirects only when it positively identifies a volunteer; if the email were ever absent it lets the request through rather than risk bouncing a staff/admin, and the API 403 + detail-page guards still protect the data. Detail routes (`/people/[id]`, `/households/[id]`) are allowed through so volunteers can reach a child's family.
2. **Detail server components** hard-guard each record with `profileVisibleToVolunteer` / `householdVisibleToVolunteer` (`lib/subsplash.ts`), redirecting to `/children` on a miss — this is what stops a volunteer typing a URL to an unrelated adult.
3. **API routes**: a new `/api/children` (children-only, filtered server-side in `searchChildren`) is open to all authenticated roles; `/api/profiles` and `/api/households` GET now require `requireStaffOrAdmin()` (403 for volunteers).

## Consequences

- `lib/subsplash.ts` gains `searchChildren`, `householdHasChild`, `profileVisibleToVolunteer`, `householdVisibleToVolunteer`, all derived from the already-cached profile walk (ADR-0009) — no new Subsplash calls.
- The visibility predicate walks the cached profile set per detail-page render. That set is already cached (ADR-0009), so the cost is an in-memory scan, not extra API traffic.
- The Children page (`app/(dashboard)/children/page.tsx`) and `useChildren` hook are near-duplicates of the People equivalents. Accepted for now; a future `<DirectoryList>` extraction could DRY them.
- Reusing the shared detail routes means the per-record guard is load-bearing: if a future change adds an unguarded read path to profile/household data, volunteers could reach adult PII again. New read surfaces must apply the same predicate.

## Alternatives rejected

- **Dedicated `/children/[id]` detail routes.** Cleaner separation, but duplicates the entire detail UI and its future maintenance; the per-record guard on the existing routes achieves the same isolation with far less code.
- **Nav/list hiding only.** A volunteer could still load a restricted profile by guessing a URL — not a real restriction for PII.
- **A `childrenOnly` flag on `searchProfiles` instead of `searchChildren`.** Would leave `overallTotal` reporting the whole directory and risks an adult leaking through if a caller forgets the flag; a dedicated function fails safe.

## Amendment (2026-07-14): member-type filter

The Children *list* (not just the detail pages) now also supports showing a child's family, not just the child: `searchChildren`'s base pool widened from "children" to "members of a child-bearing household" (children + their guardians/parents/siblings) — exactly `profileVisibleToVolunteer`'s existing set, so this never exposes anyone a volunteer couldn't already reach by opening a child's household. A `memberType` param (`"Child" | "Adult" | "All"`, exposed as filter chips on the Children page) narrows that pool; it **defaults to `"Child"`** inside `searchChildren` itself (not just in the UI), so an old client or a request that omits the param gets the original children-only behavior — the widening is opt-in, never ambient. `householdMemberType` (Adult/Child/Unknown categorization) moved from `HouseholdTypeBadge` into `lib/household.ts` so the badge and the filter share one definition.
