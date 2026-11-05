# ADR-0030: Care notes use Subsplash's built-in `care_notes` field

Status: accepted. Supersedes the write path of ADR-0020.

## Context

ADR-0020 moved a child's care notes to a `VOLUNTEERNOTES` custom field. The live
org never had that field: scanning the roster found no profile carrying it, and
Subsplash has no endpoint to read a custom field definition directly. Every
write failed with "Could not resolve the volunteernotes custom field's write
metadata", including the household self-update (ADR-0029). The church uses
Subsplash's built-in "private" `care_notes` profile field.

## Decision

- Writes send `care_notes` as a plain top-level string on the profile PATCH,
  like `allergy_notes`. No custom-field metadata is needed.
- Reads use `care_notes` first and fall back to a `VOLUNTEERNOTES` custom field
  value, so nothing stored under ADR-0020 is hidden.
- The app-facing `Profile.care_notes` name is unchanged.

## Also

A profile's own address is created by Subsplash on first write and must carry
`org_key` ("either an org_key or app_key is required"); `updateProfile` now adds it.
