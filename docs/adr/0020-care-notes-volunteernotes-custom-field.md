# ADR-0020: Care notes move from a plain Profile field to the VolunteerNotes custom field

**Status:** Accepted
**Date:** 2026-08-04

## Context

ADR-0012 read/wrote a child's care/safety notes via `care_notes`, a plain top-level string field on Subsplash's Profile resource (`RawProfile.care_notes`, PATCHed directly in the body — not through the `custom_fields` array Campus/DirectoryAccess/DirectoryRole use). That field is Subsplash's own built-in "private" notes field, which the church doesn't otherwise manage or configure — it can't be renamed, hidden, or reused the way a custom field can, and it isn't a field the church's Subsplash admins were actually using day to day.

The church asked for this data to instead live in a custom field they name and manage themselves in Subsplash: `VolunteerNotes`.

## Decision

`care_notes` is now backed by a Subsplash custom field named `VOLUNTEERNOTES` (name configurable via `SUBSPLASH_NOTES_FIELD_NAME`, same override pattern as `SUBSPLASH_ACCESS_FIELD_NAME`/`SUBSPLASH_ROLE_FIELD_NAME`), not the native top-level `care_notes` Profile field. The native field is no longer read or written at all.

- `lib/subsplash.ts` gains the same discover-write-metadata-from-real-data pattern already used for Campus/DirectoryAccess/DirectoryRole: `findNotesField`/`extractCareNotes` (read), `NotesFieldMeta`/`mergeNotesFieldMeta`/`getNotesFieldMetaCached` (write metadata, sampled from real profile data since Subsplash has no custom-field-definitions endpoint), and `buildVolunteerNotesFieldInput` (write). Unlike Campus/DirectoryAccess/DirectoryRole, VolunteerNotes is always free text — there's no fixed set of choices to resolve, so its metadata is just a definition/revision id and its write is always `{ text: notes }`.
- The app-facing shape is unchanged: `Profile.care_notes` is still the field name everywhere above `lib/subsplash.ts` (`types/profile.ts`, `lib/validation/profile.ts`, `EditProfileForm`, `CareNotesEditor`, the `care-notes` API route, kiosk labels). Only `mapProfile`/`updateProfile`'s internal storage mechanism changed — a deliberate abstraction boundary, the same one that already let Campus/DirectoryAccess/DirectoryRole live in custom fields without every call site knowing that.
- Mock data (`lib/mockData.ts`) mirrors this the same way it already does for `directory_access`/`directory_role`: `care_notes` stays a plain top-level field on the mock `Profile` objects (mock mode never parses raw custom fields), with a matching `VOLUNTEERNOTES` entry in `custom_fields` for display parity, and `updateProfile`'s mock branch keeps both in sync on write.

## Consequences

- A church admin can rename, hide, or reconfigure the notes field in Subsplash like any other custom field, instead of being stuck with Subsplash's built-in "private" field semantics.
- Every other part of ADR-0012's and ADR-0018's reasoning (visible to any role that can reach the profile, editable by any signed-in role, child-only, `profileVisibleToVolunteer` scoping) is unchanged — this ADR only changes *where the value lives in Subsplash*, not who can see or edit it.
- A save now costs one extra profile-metadata lookup (`buildVolunteerNotesFieldInput`'s discovery fetch) the same way Campus/DirectoryAccess/DirectoryRole writes already do, and throws `CustomFieldUpdateError` (surfaced as a 422 by the calling route) if the church hasn't configured a `VolunteerNotes` custom field yet.

## Alternatives rejected

- **Keep the native `care_notes` field and add `VolunteerNotes` as a second, separate field.** Rejected — the church asked for the data to move, not to be duplicated; two places to edit the same fact invites drift.
- **Rename the app-level `Profile.care_notes` field to `volunteer_notes`.** Rejected as unnecessary churn — the storage mechanism changed, not the concept. Keeping the app-facing name stable meant the entire UI layer, validation schema, and the ADR-0018 route needed zero changes.
