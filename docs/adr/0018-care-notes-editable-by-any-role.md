# ADR-0018: Care notes are editable by any authenticated role, not just admin

**Status:** Accepted
**Date:** 2026-07-23

## Context

ADR-0012 made `care_notes` (a child-only, Subsplash-"private" free-text field) *visible* to any role that can reach a profile's detail page — admin, staff, and volunteer alike — but left *editing* it admin-only, inheriting the `/people/[id]/edit` redirect and `requireAdmin()` on `PATCH /api/profiles/[id]`. In practice, the people actually present with a child day-to-day — a volunteer ministry leader, or staff who aren't admins — are the ones most likely to have an update worth recording (a new allergy note, a pickup instruction, a behavioral note), and neither could do it themselves.

## Decision

Admin, staff, **and volunteer** can all now update a child's care notes, via a small inline editor (`components/CareNotesEditor.tsx`) directly on the `/people/[id]` detail page — not by sending everyone through the full `EditProfileForm`, which exposes several admin-only fields (email, Campus, Directory Access, Directory Role) a volunteer shouldn't see an entry point to at all.

This is a new, narrowly-scoped write route, `PATCH /api/profiles/[id]/care-notes`, rather than loosening `PATCH /api/profiles/[id]` itself:

- Any authenticated session may call it (no admin/staff check) — this is the first time a volunteer is allowed to mutate anything in this app.
- It only ever accepts `care_notes` (`updateCareNotesSchema`, a `.pick()` off the full `editProfileSchema` so the length/trim rule can't drift out of sync) — no other field can ride along.
- It rejects (400) if the target profile isn't a child (`household_role !== "child"`), matching care_notes's existing child-only meaning in Subsplash.
- A volunteer caller must still pass `profileVisibleToVolunteer(id)` (ADR-0011) — the permission loosened, but the set of profiles a volunteer can reach at all didn't. This re-derives the same predicate the read side already enforces, per ADR-0011's own warning that any new surface touching profile data must independently re-check it.

The detail page's Care & Safety section now renders for every child regardless of whether `care_notes` already has a value (previously it only appeared when there was something to show) — otherwise there'd be no way to write a *first* note.

## Consequences

- `lib/rbac.ts`'s existing guards (`requireAdmin`, `requireStaffOrAdmin`, `requireCanEmailChildren`) are all role-only, parameter-free checks; this route's auth doesn't fit that shape (it needs the specific profile id to re-check volunteer scope), so it's written inline in the route handler instead — the same style already used by `app/api/attendance/route.ts` and its siblings for exactly this kind of per-record volunteer check.
- ADR-0005 states "every write route must call `requireAdmin()` before touching Subsplash." This route is a deliberate, narrow exception to that default — not a loosening of it — the same shape of exception ADR-0017's `requireCanEmailChildren` already established for a different permission.
- `EditProfileForm`'s own `care_notes` textarea is unchanged; an admin can still edit it from either place. Two edit surfaces for one field is redundant but harmless — removing the older one wasn't necessary for this to work and was out of scope.

## Alternatives rejected

- **Let volunteers/staff reach the full `/people/[id]/edit` form**, with fields conditionally hidden by role. Rejected — mixes a broad "edit everything" surface with a narrow permission, and would require role-gating logic scattered through a component that's otherwise a straightforward single form for one role (admin).
- **Loosen `requireAdmin()` on `PATCH /api/profiles/[id]` to admit staff/volunteer.** Rejected outright — that route can change email, Campus, Directory Access, and Directory Role, none of which this ask covers; loosening it would hand out far more than intended.
