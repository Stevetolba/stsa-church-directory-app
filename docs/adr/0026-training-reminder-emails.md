# ADR-0026: Training reminder emails

**Status:** Accepted
**Date:** 2026-10-02

## Context

After the one-off invite (ADR-0023) nothing nudged people to start or finish a course. Admins want reminders on a schedule they choose per course, and a way to push one by hand.

## Decision

- **Per-course frequency**, `training_courses.reminder_frequency`: `off` (default), `weekly`, `biweekly` or `monthly`. Off by default so turning the feature on never emails anyone by surprise.
- **Who:** active enrollees whose course status isn't `completed` and who have an email. Completed people and removed people never get one. Unpublished courses send nothing, scheduled or manual.
- **When:** a person is due once a full interval has passed since their last reminder, or since their invite if they've never had one (`isReminderDue` in `lib/trainingLogic.ts`, with half a day of slack so a daily job running a little early doesn't skip a day). `training_enrollments.last_reminded_at` / `reminder_count` record it; a failed send doesn't restart the clock.
- **Daily job:** Vercel Cron calls `GET /api/cron/training-reminders` at 14:00 UTC (`vercel.json`), guarded by `CRON_SECRET` like the calendar sync. Sent from the church's name with replies to `EMAIL_FROM_ADDRESS`.
- **Manual push:** `POST /api/admin/training/courses/[id]/remind` (admin only) sends now to everyone unfinished, or to one `profileId`, from the admin's name with replies to them. The roster has "Send reminder now" and a per-person "Remind" button, and shows when each person was last reminded.
- **One personal email per person**, sent through Resend's batch API (`sendEmailBatch`, up to 100 per call, "permissive" so one bad address fails alone). Each email has the person's first name, their progress ("2 of 6 lessons") and a button linking straight to `/training/<course>`, plus both sign-in options. Unlike the BCC invite, nobody's address is exposed and the office inbox isn't copied on every reminder. People sharing an address (a parent and child) each get their own.

## Consequences

- There's no unsubscribe link. To stop reminders, an admin turns the course's reminders off or removes the person from the course.
- Reminders keep going until the person finishes or is removed; there's no maximum count (`reminder_count` is recorded if one is wanted later).
- The job has no persistent run log; the cron response and server logs report sent/failed counts.
