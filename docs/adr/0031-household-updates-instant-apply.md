# ADR-0031: Household updates can apply instantly

Status: accepted. Supersedes the "never auto-apply" rule of ADR-0029 when the admin switch is on.

## Context

ADR-0029 kept every household edit in a review queue until an admin accepted it.
That is safe, but it makes staff retype nothing and still wait on each family.
Families sign in with an emailed code, which proves control of an inbox and
nothing more.

## Decision

- An admin switch, "Apply household changes instantly" (`app_settings` key
  `household_auto_apply`, default off), controls the behaviour. Off is exactly
  the ADR-0029 flow.
- When on, submitting a household update writes edits to existing people and the
  household address straight to Subsplash through the same apply code as an
  admin review (`autoApplySubmittedRequest` calls `applyAcceptedChanges`), so
  split writes, per-row errors and retries are unchanged.
- Rows that stay for an admin: proposed new members (duplicates are the risk),
  rows whose live Subsplash value no longer matches the snapshot the family saw
  (drift), and any write that fails. The request stays `pending` while any
  such row remains, and the existing review page finishes it.
- Requests finished this way are marked `reviewed_by_email = 'auto'`.
- Admins get an email on every instant apply; the household gets a confirmation.
  Each submission and apply is still written to the access log.

## Consequences

- Anyone with access to a parent's inbox can change that household's details
  without an admin seeing them first. The snapshot of old values on every row
  is the record for undoing a change by hand; a one-click revert is not built.
- Turning the switch off restores full review without a deploy.
