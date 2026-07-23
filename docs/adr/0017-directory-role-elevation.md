# ADR-0017: A Subsplash "DirectoryRole" custom field elevates a non-staff person to Admin or Team Lead

**Status:** Accepted
**Date:** 2026-07-23

## Context

ADR-0010 lets a church admin flag a personal-email person for read-only "volunteer" access via a Subsplash `DirectoryAccess` custom field. Two gaps came up in practice:

1. Making a non-staff person a full admin required adding their email to the `ADMIN_EMAILS` env var — a redeploy-adjacent change, not something a church admin can do themselves from the directory app or Subsplash.
2. Some volunteers lead a ministry team and need to send the Children/Youth page's "Email Parents" feature, but shouldn't get the broader staff-level access (`requireStaffOrAdmin`-gated: the full People/Households directory, reports, kiosk device management) that granting them any more than volunteer would otherwise imply.

## Decision

A second Subsplash custom field, `DirectoryRole` (name configurable via `SUBSPLASH_ROLE_FIELD_NAME`), holds one of three values: `Admin`, `Team Lead`, `Volunteer`. It only ever elevates — unset, or `Volunteer`, leaves someone exactly where `DirectoryAccess` already puts them.

- **`Admin`**: promotes the whole session to `role: "admin"`, the same as being listed in `ADMIN_EMAILS`, just editable from Subsplash (or this app's own People page, for a staff admin) instead of an env var. Also sufficient on its own to be admitted at sign-in, without `DirectoryAccess` needing to be checked separately.
- **`Team Lead`**: grants exactly one additive permission — `session.user.canEmailChildren = true` — used by the Children page's "Email Parents" feature (both the client-side button visibility and the new `requireCanEmailChildren` server guard). Nothing else about them changes: they remain `role: "volunteer"` for every other check in the app (middleware's `VOLUNTEER_BLOCKED_PATHS`, the profile/household detail pages' PII scoping, attendance backfill/reprint restrictions, etc.), and are also admitted at sign-in on this basis alone.
- **`Volunteer`** (or unset): identical to today — admission still depends on `DirectoryAccess`.

Deliberately **not** a fourth `Role` value. `role === "volunteer"` (or `!== "volunteer"`) is used as a coarse "is this a full staff/admin session" shorthand in well over a dozen places across the app (`lib/rbac.ts`, `middleware.ts`, attendance check-in/backfill/reprint, profile/household detail pages, several page-level redirects). Adding a new `Role` value would silently change the behavior of every one of those checks (a Team Lead would fail through as "not volunteer" and inherit access nobody asked to grant them) unless each were re-audited and explicitly updated — a large, error-prone diff for what's actually a single narrow permission. An additive boolean confined to the one place that needs it is both safer and a much smaller change.

`lib/auth.ts`'s `jwt` callback resolves `DirectoryRole` via Subsplash once, only on a fresh sign-in (gated on `account` being present) — not on every token refresh, matching ADR-0010's existing "only checked at sign-in" cost model (the 24h `session.maxAge` is what forces re-validation). `middleware.ts` previously recomputed a volunteer/staff classification from the email's shape alone (`resolveRole`), which can't see a Subsplash-sourced admin elevation; `lib/auth.config.ts` (the Edge-safe config) gained a lightweight `session` callback that projects the already-resolved `token.role` instead, so a `DirectoryRole: Admin` person isn't incorrectly redirected off `/people`, `/reports`, etc.

## Consequences

- `lib/subsplash.ts` gains a second custom-field read/write pair (`extractDirectoryRole`/`getDirectoryRole`/`buildDirectoryRoleFieldInput`), following the exact discover-write-metadata-from-real-data pattern `DirectoryAccess` and `Campus` already use — Subsplash has no custom-field-definitions endpoint to look up a dropdown's choice ids directly.
- A church admin can now set `DirectoryRole` from this app's own People page edit form (admin-only, same as `Campus`/`DirectoryAccess`), not just from Subsplash's own UI.
- A fresh sign-in for a personal-email account now costs up to two additional profile lookups in the worst case (one in `signIn` to decide admission, one in `jwt` to resolve the effective role/flag) — accepted for simplicity, matching this codebase's existing preference for isolated per-callback logic over sharing state across NextAuth callbacks.

## Alternatives rejected

- **A fourth `Role` value (`"team_lead"`).** Rejected — see the "Deliberately not a fourth Role value" reasoning above.
- **A second env var allowlist** (e.g. `TEAM_LEAD_EMAILS`, mirroring `ADMIN_EMAILS`). Rejected for the same reason ADR-0010 rejected a `VOLUNTEER_EMAILS` list: it creates a second list to keep in sync by hand, when Subsplash (which the church already manages membership data in) can hold it instead.
