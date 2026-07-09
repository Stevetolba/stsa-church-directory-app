# ADR-0001: Staff authentication is separate from Subsplash

**Status:** Accepted
**Date:** 2026-07-09

## Context

`POST /tokens/v1/token` on the Subsplash API takes `grant_type=client_credentials` plus a `client_id`/`client_secret` and returns an org-scoped access token. It has no concept of an individual user logging in — it authenticates the *app*, not a staffer. The original tech spec assumed staff would authenticate directly against Subsplash with email/password; that assumption is incorrect and is superseded by this ADR.

## Decision

Build a dedicated staff authentication layer in the app, independent of Subsplash: **Google Workspace SSO via Auth.js (NextAuth v5)**, using the Google provider, with sign-in restricted to the church's Workspace domain (`hd` claim check). The Subsplash service token (see ADR-0003) is a separate, backend-only credential used for all API calls regardless of which staffer is signed in — the two token concepts are never conflated.

Implementation notes:
- `next-auth@beta` (Auth.js v5) with the Google provider.
- OAuth credentials created in Google Cloud Console for the church's Workspace.
- `signIn` callback verifies the Google `hd` claim equals the church domain; reject anyone outside it. `hd` is spoofable in theory, so the resolved email is also checked against the known-staff/admin model (ADR-0002) as defense in depth.
- No password management, no reset flows — Google owns all of it.

## Consequences

- Adds `next-auth` as a dependency.
- The `/login` screen is a single "Sign in with Google" button, not an email/password form.
- The old hand-rolled `/api/auth/login` and `/api/auth/logout` routes from the original spec are replaced by NextAuth's own route handler (`app/api/auth/[...nextauth]/route.ts`).

## Alternatives rejected

- **Email + password with an invite-only user store.** Full control, but the team owns password resets, hashing, and the associated security surface — more work and more risk for a small internal tool.
- **A managed auth provider** (Clerk, Auth0, Supabase Auth). Fast and secure, but adds a vendor the church doesn't otherwise need given it already runs on Google Workspace.
