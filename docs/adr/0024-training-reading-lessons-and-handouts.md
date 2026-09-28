# ADR-0024: Reading lessons and lesson handouts

**Status:** Accepted
**Date:** 2026-09-28

## Context

ADR-0023 built every training lesson around an unlisted YouTube video: `training_lessons.youtube_video_id` was `NOT NULL`, and completion/quiz-gating assumed a video. Some lessons are better as text to read (no video needed), and admins want to attach a handout (a link to a PDF, slides, etc.) to a lesson.

## Decision

- **A `type` discriminator on `training_lessons`** (`'video' | 'reading'`, default `'video'`). `youtube_video_id` is now nullable — `NULL` for a reading lesson. `training_lessons.description`, which already held supplementary text shown under a video, is reused as the reading lesson's body (same `dangerouslySetInnerHTML` render) rather than adding a second content column.
- **A handout is a pasted URL**, `training_lessons.handout_url`, the same pattern as `training_courses.cover_image_url` (an admin pastes a Drive/Dropbox/S3 link). The app has no file-upload/storage integration, and adding one wasn't judged worth the scope for this.
- **A reading lesson completes via an explicit "Mark as read"** (`POST /api/training/lessons/[id]/read`, `lib/training.ts` `markContentRead`) — parity with a video's "watched to `min_watch_pct`" gate, not auto-complete on view or quiz-only. The quiz feature (`training_quiz_questions`) already hangs off `lessonId`, not video, so it's reused unchanged for reading lessons.
- **`training_progress.video_completed_at` is generalized in code, not renamed in the database.** The Drizzle field is now `contentCompletedAt` (mapped to the same `video_completed_at` column) since `trainingLogic.isLessonComplete` already treated it as type-agnostic (content done, then quiz if any). Renaming the underlying column was rejected to avoid a migration against a production table with real learner progress.

## Consequences

- `lessonInputSchema` no longer requires a valid YouTube id at the schema level (it's now nullable/optional); the admin editor still blocks saving a `video`-type lesson without one, client-side, same as before.
- A course roster/report that lists "% watched" per lesson shows 0 for reading lessons (they don't track a percentage) — acceptable since "complete" is still shown correctly from `contentCompletedAt`.

## Alternatives rejected

- **Real file upload for handouts** (e.g. Vercel Blob) — bigger scope (new dependency, upload endpoint) for a need the pasted-URL pattern already serves elsewhere in this app.
- **A separate `body`/`content` column for reading lessons** — `description` already serves this exact purpose for video lessons; duplicating it would mean two near-identical HTML fields per lesson.
- **Renaming `video_completed_at` to `content_completed_at` in Postgres** — safe in principle (an additive rename preserves data) but an unnecessary risk on the real database for a purely cosmetic gain; Drizzle's column-name mapping gets the same clarity in code for free.
- **Auto-complete-on-view or quiz-required for reading lessons** — rejected in favor of explicit "Mark as read" to match the video lesson's own explicit completion gate.
