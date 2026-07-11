# ADR-0010: Volunteer read-only access via a Subsplash-managed allowlist

**Status:** Accepted
**Date:** 2026-07-11

## Context

Until now only church staff with a Google **Workspace** email could sign in — the `signIn` callback in `lib/auth.ts` rejected any email that wasn't on `CHURCH_GOOGLE_WORKSPACE_DOMAIN` (checking both the Google `hd` claim and the email suffix, per ADR-0001). Volunteers who help with the directory don't have a workspace email; they use personal emails, so they couldn't get in at all.

The goal: let volunteers **view** the directory (read-only) while admins keep write access. Two existing facts made this small rather than a rebuild:

1. **The read-only tier already exists.** Every mutating route calls `requireAdmin()` (ADR-0005) and returns 403 for non-admins, and the Edit UI is gated on `role === "admin"`. Any non-admin role is automatically read-only — nothing to build on the authorization side beyond adding the role.
2. **The only blocker was the sign-in gate.** We just had to admit approved personal emails.

Constraints that shaped the design:

- The app is deliberately **stateless** — pure JWT sessions, no database. Auth.js's email "magic link" provider requires a database adapter plus an email-sending service, which would be a significant new dependency.
- Subsplash is already the system of record for people, and church staff already manage it. Access decisions can live there rather than in code/env, so staff can grant/revoke without a developer or a redeploy.

## Decision

Three parts:

1. **Login: reuse the existing Google provider.** Volunteers sign in with a **personal Google account** (Gmail, or any Google-linked email). No new provider, database, or email service — the app stays stateless. Volunteers whose email isn't a Google account aren't supported (acceptable; revisit with a magic-link + DB provider only if that becomes a real need).

2. **Access control: managed in Subsplash via a custom field.** A person is granted access by setting a **custom field** ("Directory Access", name overridable via `SUBSPLASH_ACCESS_FIELD_NAME`) to an affirmative value on their Subsplash profile. At sign-in, `hasDirectoryAccess(email)` (`lib/subsplash.ts`) does an exact-match `filter[email]` lookup and grants access if a matching **active** profile has that field set. This reuses the exact `custom_fields` parsing the code already has for "Campus". Church staff manage access in Subsplash's UI — no redeploy.

3. **A distinct `volunteer` role.** `Role` becomes `"admin" | "staff" | "volunteer"`. `resolveRole` is now 3-way: `admin` (in `ADMIN_EMAILS`) → `staff` (workspace-domain email) → `volunteer` (everyone else who passed the gate). Volunteer is non-admin, so it inherits read-only behavior everywhere automatically. It's kept distinct from `staff` (rather than reusing it) so the UI can label volunteers and so they could be restricted further later.

The `signIn` gate now admits an email if **any** hold: it's an admin (`ADMIN_EMAILS`), or a workspace account (`hd` + suffix, unchanged), or a **verified** personal email with Subsplash directory access. Google `email_verified` is required for all, since the email is used as an identity key. `hasDirectoryAccess` **fails closed** (returns false) on any Subsplash error — this gates member PII.

## Consequences

- **Revocation is not instant.** The access check runs only at **sign-in** (JWT sessions aren't re-checked per request). A volunteer whose field is unset in Subsplash keeps their session until it expires. Mitigated by setting `session.maxAge` to **24h**, so revocation takes effect within a day. (A shorter window trades more frequent re-logins; 24h is a starting point.)
- Requires the volunteer's Google-account email to **exactly match** the email on their Subsplash profile.
- One-time Subsplash setup (church admin, not code): create the "Directory Access" custom field and set it to "Yes"/checked for each approved volunteer.
- The `Record<Role, string>` label map in `components/Sidebar.tsx` makes adding the role fail the build until a label is provided — a built-in guarantee every role is handled in the UI.

## Alternatives rejected

- **Env allowlist** (a second `VOLUNTEER_EMAILS` variable): simplest code, but every add/remove is a developer redeploy. Subsplash management was chosen specifically to avoid that.
- **A Subsplash group** instead of a custom field: groups aren't read anywhere in the codebase today, so it would mean new endpoints and mapping for no advantage over reusing the existing custom-field parsing.
- **Magic-link / any-email login**: requires a database adapter + an email service — a large addition to a deliberately DB-free app. Rejected because volunteers will use Google accounts.
- **Reusing the `staff` role for volunteers**: functionally identical today (both read-only), but a distinct role costs almost nothing and preserves the ability to label and later restrict volunteers.
