# ADR-0007: Membership status is not editable in v1

**Status:** Accepted
**Date:** 2026-07-10

## Context

The tech spec's Edit Profile page lists `status` among the editable fields (`first_name, last_name, email, phone_number, status`). Building Step 11, a full search of `openapi.yaml` found no endpoint anywhere that creates or updates a `MembershipStatusChange` — the schema exists (`MembershipStatusChange`, `LatestMembershipStatusChange`) but has zero associated paths in this spec. `/people/v1/profiles/{id}/status`, referenced in the main PATCH endpoint's docs, governs a different concept entirely: `ProfileStatus` (`active/archived/merged/gdpr/fraud` — record lifecycle), not membership category (`Member/Visitor/Newcomer/...` — see ADR-0006).

## Decision

The Edit Profile form (`/members/[id]/edit`) only covers `first_name`, `last_name`, `email`, and `phone_number` — matching what `lib/subsplash.ts`'s `UpdateProfileInput` type already supports (set in Step 3, before this form existed). The status badge is shown read-only at the top of the form for context, but is not part of the editable fields or the PATCH payload.

## Consequences

- The app cannot change a member's membership status. If that becomes a real need, it requires either: a Subsplash API surface this org's plan doesn't currently expose to us, or a different mechanism entirely (e.g. staff make the change directly in Subsplash's own dashboard). This is a real capability gap the church should be aware of, not just an implementation detail.
- If Subsplash exposes a membership-status-change endpoint in the future, wiring it up is its own follow-up — not something to silently bolt onto this form's existing PATCH call, since it's a conceptually distinct resource with (per the schema) its own `effective_on` metadata.

## Alternatives rejected

- **Show a disabled status dropdown with an explanatory note.** Considered, but adds UI for a capability that doesn't exist and isn't imminent; the read-only badge already shown on the detail page communicates status without implying editability.
- **Make status editable against mock data only.** Rejected — would present a working-looking control in the demo that silently does nothing (or errors) once wired to the real API, which is worse than not having it at all.
