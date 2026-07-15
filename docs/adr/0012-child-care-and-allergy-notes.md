# ADR-0012: Surfacing child care & allergy notes

**Status:** Accepted
**Date:** 2026-07-14

## Context

Subsplash stores two safety-relevant free-text fields on a profile that the app never surfaced: `allergy_notes` (any profile) and `care_notes` (only populated for child profiles, and flagged **"private"** in the Subsplash dashboard). Children's-ministry volunteers — who this app already gives scoped access to children and their families (ADR-0011) — had no way to see a child's allergies or special-care instructions from the directory, which is exactly the information someone supervising kids needs.

## Decision

Surface both fields.

- **Data:** both are plain top-level string fields on the Subsplash Profile (max 1500), so they map through `mapProfile` and ride the existing `updateProfile` PATCH body with no special handling — unlike `campus`, which lives in custom fields (ADR's around it). Added to the `Profile` type, `RawProfile`, `UpdateProfileInput`, and `editProfileSchema`.

- **View access:** both fields are visible to **anyone who can already reach the person's detail page** — staff, admin, **and volunteers**. This is a deliberate, church-approved choice: the safety value of a volunteer seeing a child's allergies outweighs the "private" flag on `care_notes`, and the existing volunteer visibility guard (`profileVisibleToVolunteer`, ADR-0011) already restricts *which* people a volunteer can open at all. No new view-gating was added. `care_notes` renders **only for children** (matching Subsplash, which only populates it there), gated on the same coarse Adult/Child grouping the Household section uses.

- **Edit access:** unchanged — admin-only, inheriting the existing `/people/[id]/edit` redirect and `requireAdmin` on `PATCH /api/profiles/[id]`. The care-notes textarea in `EditProfileForm` only appears for child profiles.

- **Presentation:** allergies show as a visually distinct amber "safety" callout; care notes as a labeled "Private" block.

## Consequences

- A field Subsplash marks "private" is now visible to volunteers in this app. That is intentional and scoped: volunteers only ever reach child + child-family profiles, and only admins can edit. If a church wants care notes hidden from volunteers, the gate would be a single role check on that block (the access decision, not the mechanism, is what this ADR records).
- Because the fields are plain strings, a real-API write behaves like the already-working `first_name` update — no new failure mode versus the campus/address write paths.

## Note

There is a pre-existing ADR numbering collision (two `0010-*` files) unrelated to this change — worth cleaning up separately.
