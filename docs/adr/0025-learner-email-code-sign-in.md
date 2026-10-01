# ADR-0025: Learner sign-in with an emailed one-time code

**Status:** Accepted
**Date:** 2026-10-01

## Context

Learners (ADR-0023) are anyone an admin invites to training, and many of their Subsplash emails aren't Google accounts, so "Sign in with Google" was the only way in and they couldn't reach their training.

## Decision

- **Credentials provider with an emailed 6-digit code**, id `learner-code` (`lib/auth.ts`). NextAuth's built-in Email/Resend providers need a database adapter and a users table, and this app has neither (sessions are stateless JWTs, people live in Subsplash). No passwords are stored, so there is nothing to reset or leak.
- **Who can use it:** an active Subsplash profile on that email whose `DirectoryRole` is `Learner` with no `DirectoryAccess` (`listLearnerProfilesByEmail`, the same rule the jwt callback uses), and who is enrolled in at least one course. The enrollment check matters because removing someone from a course cannot clear their Learner role (ADR-0023). Google sign-in is unchanged for everyone else, and a code sign-in only ever yields the `learner` role, so middleware keeps them on `/training`.
- **Codes** (`lib/loginCode.ts`, table `login_codes`): `crypto.randomInt`, stored only as a salted sha256 hash, valid 10 minutes, single use (consumed with a conditional `UPDATE … RETURNING`), invalid after 5 wrong guesses, at most 5 requests per email per hour, and a new request invalidates the previous code. The request endpoint answers identically whether or not the email belongs to a learner.
- **Shared emails:** children often use a parent's address. After the code checks out, the login page lists the eligible learners and the person picks who is signing in; the chosen profile id goes through the provider, so no name matching is needed (a code sign-in has no Google name to match on).
- **A separate single-recipient `sendEmail`** (`lib/email.ts`). `sendBulkEmail` always addresses `EMAIL_FROM_ADDRESS`, which would copy every login code to the church office inbox.
- **Audit log fix:** `access_events_role_check` did not allow `'learner'`, so learner sign-ins were silently dropped from the activity log. The migration adds it.

## Consequences

- Sessions keep the existing 24-hour lifetime, so a code-based learner requests a new code each day.
- Throttling is per email only. The app has no rate-limit infrastructure, so there is no per-IP limit.
- Anyone who can read the invited inbox can sign in as that learner, which is the same trust level as a password reset email.
