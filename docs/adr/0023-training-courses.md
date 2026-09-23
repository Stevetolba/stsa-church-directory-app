# ADR-0023: Training courses (video lessons, quizzes, and a per-course Subsplash status field)

**Status:** Accepted
**Date:** 2026-09-23

## Context

The church wants to train members and volunteers through short recorded courses (e.g. "Membership Group": six video sessions, each followed by a quiz) and to see each person's progress in Subsplash. Until now the app admitted only admins and people flagged `DirectoryAccess=Yes` (ADR-0010) or elevated by `DirectoryRole` (ADR-0017), and had no video, quiz, or per-person progress concept.

## Decision

- **Content and detailed progress live in Postgres** (`training_courses`, `training_lessons`, `training_quiz_questions`, `training_progress`, `training_enrollments`, `training_course_status`), keyed on the Subsplash profile id like `check_ins`. Quiz answer keys stay server-side; grading is `POST /api/training/lessons/[id]/quiz`.
- **Video is unlisted YouTube**, embedded via the IFrame Player API, which reports the furthest point watched. A lesson is complete when the video reaches `min_watch_pct` and (if it has one) the quiz is passed. Lessons unlock in order. This is a completion nudge, not proctoring — a learner can scrub forward.
- **Subsplash gets a summary only:** one choice custom field per course (`training_courses.subsplash_field_name`, e.g. `MembershipGroupStatus`) set to `In Progress` / `Completed` when the status changes (`lib/training.ts` `recomputeCourseStatus`). A failed write never fails the learner's request; it is stored on `training_course_status.subsplash_sync_error` and retried from the admin roster ("Retry Subsplash sync").
- **A generic choice-field writer** (`lib/subsplash.ts` `resolveChoiceFieldMeta` / `buildChoiceFieldInput` / `setChoiceCustomField`) replaces hand-writing the meta/merge/sample/build quartet per field. Resolved definition/revision/choice ids are cached in Postgres (`custom_field_meta_cache`). As with every other custom field here, Subsplash has no definitions endpoint, so an admin must set each choice once on a profile; the admin "Verify field" button reports what was discovered.
- **New `learner` role.** An admin invites people from the People list (bulk by filter, or per person). Anyone with no `DirectoryAccess` and no `DirectoryRole` gets `DirectoryRole = "Learner"`; anyone with existing access is never changed. `lib/auth.ts` admits `Learner` at sign-in and resolves it to role `learner` unless the person also has `DirectoryAccess`. `middleware.ts` confines learners to `/training`; `lib/rbac.ts` denies them on every directory endpoint. Learners only see courses they are enrolled in. The invite optionally emails a link through Resend.
- **Authoring is an admin UI** under Settings → Manage Training (courses, lessons, quiz questions, roster).

## Consequences

- The Subsplash `DirectoryRole` dropdown needs a "Learner" option (and each course needs its status field with the two choices) before invites/sync work against the real org.
- Removing someone from a course ends the enrollment but cannot clear their `Learner` role through this API; the admin is told to clear it in Subsplash. They see no courses in the meantime.
- Role checks that were written as `role === "volunteer"` deny-lists had to gain `|| role === "learner"` (`lib/rbac.ts`); new role checks should prefer allow-lists.

## Alternatives rejected

- **A text summary field** or **completion-only writes** — the church chose one choice field per course so progress is filterable in Subsplash.
- **Uploading video into the app** — higher cost and effort than unlisted YouTube for no requirement that needs it.
- **Open sign-up for any member** — the church wants invitations to be an explicit admin action.
