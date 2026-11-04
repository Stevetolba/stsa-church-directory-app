# ADR-0027: Sign-in resolves the Subsplash profile by email alone

**Status:** Accepted
**Date:** 2026-11-04

## Context

ADR-0023 made sign-in lookups match the Subsplash profile on name as well as email, so a child using a parent's email wouldn't inherit the parent's access. In practice the Google display name is too unreliable to match against: nicknames, non-Latin names, and arbitrary display names made valid volunteers see "That Google account isn't recognized" even though a profile with `DirectoryAccess = Yes` existed under their email.

## Decision

`resolveProfileByEmail()` (`lib/subsplash.ts`) fetches every active profile with the signed-in (Google-verified) email and picks the one to sign in as: a profile with `DirectoryAccess` granted (highest `DirectoryRole` among those), else the highest `DirectoryRole`, else the first profile (id only). `hasDirectoryAccess`, `getDirectoryRole` and `getProfileIdByEmail` wrap it and no longer take a name; `lib/auth.ts` does one lookup per sign-in. `lib/profileMatch.ts` is removed. This supersedes the name-matching rule of ADR-0023.

## Consequences

- Anyone who signs in with a Google account whose verified email is on a `DirectoryAccess = Yes` profile gets that access, regardless of display name. The verified email is the identity key.
- A child sharing a parent's email signs in via Google as the parent's profile. Learners without Google still use the email-code flow (ADR-0025), which selects the exact profile and is unaffected.
- Still fails closed: no active profile with access/role, or any Subsplash error, denies sign-in.
