// Drizzle schema for the app-owned attendance store (ADR-0015, capture
// retired in favor of Subsplash import per ADR-0021). Subsplash's Events API
// exposes only a `check_in_enabled` toggle and a read-only `has_check_ins`
// flag — there is no endpoint to read or write per-person check-ins, and no
// check-in webhook — so attendance lives here, keyed to Subsplash
// profile/event ids and populated by a scheduled import from the Subsplash
// Check-In dashboard's own attendee export.
//
// People are NOT duplicated: a check-in stores only the Subsplash profile_id
// plus a display-name snapshot (so reports still render if a profile is later
// merged/archived) and an is_child flag (fast child counts without re-joining
// the directory).

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  unique,
} from "drizzle-orm/pg-core";

export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Repeating-event id when the occurrence came from a Subsplash series,
    // else the one-off event's own id. Keying attendance on
    // (series_id, occurrence_date) makes "the last N Sundays" a simple
    // GROUP BY and survives Subsplash re-materializing an occurrence under a
    // new event id.
    seriesId: text("series_id").notNull(),
    // The concrete Subsplash event id for this specific occurrence.
    eventId: text("event_id").notNull(),
    // Event-local calendar date (derived from start_at + the event timezone).
    occurrenceDate: date("occurrence_date").notNull(),
    // Subsplash profile id, or a synthetic `guest:<uuid>` for a walk-in not in
    // the directory (stays NOT NULL, never collides).
    profileId: text("profile_id").notNull(),
    displayName: text("display_name").notNull(),
    isChild: boolean("is_child").notNull().default(false),
    // Subsplash session (class/room). Null when the event has no sessions.
    sessionId: text("session_id"),
    sessionName: text("session_name"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    // User email, or `device:<device_id>` for a kiosk device actor — who
    // *operated* the check-in, not who brought the child (see below).
    checkedInBy: text("checked_in_by").notNull(),
    // For a child, the adult household member who dropped them off — distinct
    // from checked_in_by, which is the staff/volunteer running the screen.
    // Lets a classroom teacher match drop-off against pickup. Null for an
    // adult/guest checking themselves in, or when no adult was on the roster
    // to pick from.
    droppedOffByProfileId: text("dropped_off_by_profile_id"),
    droppedOffByName: text("dropped_off_by_name"),
    // Short code printed on the child's label and a matching tag for the
    // adult who dropped them off, so pickup can be verified at a glance.
    // Shared across siblings checked in in the same batch. Null for an
    // adult/guest check-in or an "everyone"-type session (kids stay with
    // their parents there, same rule as droppedOffBy*).
    matchCode: text("match_code"),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    checkedOutBy: text("checked_out_by"),
    // 'live'/'kiosk' are retired capture methods (ADR-0015, superseded by
    // ADR-0021) kept in the constraint so historical rows stay valid;
    // 'backfill' is a staff/admin manual entry; 'subsplash' is an imported row.
    method: text("method").notNull().default("live"), // 'live' | 'backfill' | 'kiosk' | 'subsplash'
    isGuest: boolean("is_guest").notNull().default(false),
  },
  (t) => ({
    // Doubles as double-tap protection: one check-in per person per occurrence.
    uniquePerOccurrence: unique("check_ins_unique").on(
      t.seriesId,
      t.occurrenceDate,
      t.profileId
    ),
    seriesOccurrenceIdx: index("check_ins_series_occurrence_idx").on(
      t.seriesId,
      t.occurrenceDate
    ),
    profileIdx: index("check_ins_profile_idx").on(t.profileId),
    methodCheck: check(
      "check_ins_method_check",
      sql`${t.method} in ('live','backfill','kiosk','subsplash')`
    ),
    checkoutOrderCheck: check(
      "check_ins_checkout_order_check",
      sql`${t.checkedOutAt} is null or ${t.checkedOutAt} >= ${t.checkedInAt}`
    ),
  })
);

// One row per attempted attendance-import run for one series/occurrence
// (ADR-0021) — the last-run status the Reports UI shows, and the record of
// which attendees couldn't be matched to a directory profile (they're still
// counted via a guest row, per lib/attendanceImport.ts, but need a human to
// notice and fix them or they silently pollute the absentee list).
export const attendanceImports = pgTable(
  "attendance_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull(), // currently always 'subsplash'
    seriesId: text("series_id").notNull(),
    occurrenceDate: date("occurrence_date").notNull(),
    rowsSeen: integer("rows_seen").notNull(),
    rowsMatched: integer("rows_matched").notNull(),
    rowsUnmatched: integer("rows_unmatched").notNull(),
    // Names Subsplash exported that couldn't be resolved to a profile —
    // surfaced verbatim in the report UI so an admin can go fix the mismatch
    // (typo, name change, not yet in the directory) rather than it silently
    // showing that person as absent forever.
    unmatchedNames: jsonb("unmatched_names").$type<string[]>().notNull().default([]),
    error: text("error"),
  },
  (t) => ({
    seriesOccurrenceIdx: index("attendance_imports_series_occurrence_idx").on(
      t.seriesId,
      t.occurrenceDate
    ),
  })
);

// Audit log (ADR-0016): every sign-in attempt (allowed or denied) and every
// directory read (People/Households/Children search, attendance reports) —
// so an admin can see who's accessed the directory and when. Logging is
// best-effort (lib/accessLog.ts never lets a write here fail the request
// it's recording), so this table has no foreign keys into anything else.
export const accessEvents = pgTable(
  "access_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    email: text("email").notNull(),
    // Display name from the Google/session profile at the time of the event.
    // Null for rows recorded before this column existed — the UI falls back
    // to email for those.
    name: text("name"),
    // Resolved via lib/roles.ts's resolveRole — set even for a denied sign-in
    // (resolveRole only classifies the email shape, it doesn't itself decide
    // access) so a denied row still shows who they would have been.
    role: text("role").notNull(), // 'admin' | 'staff' | 'volunteer'
    eventType: text("event_type").notNull(), // 'sign_in' | 'sign_in_denied' | 'directory_read'
    // Short label for what was read — e.g. "profiles", "households",
    // "children", "attendance-report". Null for sign_in/sign_in_denied.
    resource: text("resource"),
  },
  (t) => ({
    occurredAtIdx: index("access_events_occurred_at_idx").on(t.occurredAt),
    emailIdx: index("access_events_email_idx").on(t.email),
    roleCheck: check("access_events_role_check", sql`${t.role} in ('admin','staff','volunteer')`),
    eventTypeCheck: check(
      "access_events_event_type_check",
      sql`${t.eventType} in ('sign_in','sign_in_denied','directory_read')`
    ),
  })
);

// Training courses (video lessons + quizzes). Content and per-person
// progress live here in Postgres — Subsplash only gets a one-field summary
// per course (a choice custom field named by trainingCourses.subsplashFieldName,
// e.g. "MembershipGroupStatus" = "In Progress"/"Completed"), written by
// lib/training.ts's recomputeCourseStatus. Quiz answer keys
// (trainingQuizQuestions.correctOptionIds) are never sent to a learner's
// browser — only app/api/training routes read this table server-side.
export const trainingCourses = pgTable("training_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  // 'all' = any signed-in role (admin/staff/volunteer/learner) can see it in
  // the catalog once enrolled/published; 'volunteer' hides it from learners
  // entirely (a volunteer-only training) even if they're somehow enrolled.
  audience: text("audience").notNull().default("all"),
  published: boolean("published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  // The Subsplash custom field this course's completion status is written
  // to (a per-course choice field, e.g. "MembershipGroupStatus") — see
  // lib/subsplash.ts's resolveChoiceFieldMeta/setCourseStatusField.
  subsplashFieldName: text("subsplash_field_name"),
  passThreshold: integer("pass_threshold").notNull().default(80),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingLessons = pgTable(
  "training_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => trainingCourses.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    title: text("title").notNull(),
    description: text("description"),
    // Bare 11-char YouTube video id (not a full URL) — the admin lesson
    // editor extracts it from a pasted URL; see lib/youtube.ts.
    youtubeVideoId: text("youtube_video_id").notNull(),
    // % of the video that must be watched before the lesson counts as
    // video-complete (and, if it has no quiz, complete outright).
    minWatchPct: integer("min_watch_pct").notNull().default(90),
    published: boolean("published").notNull().default(false),
  },
  (t) => ({
    courseIdx: index("training_lessons_course_idx").on(t.courseId),
  })
);

export const trainingQuizQuestions = pgTable(
  "training_quiz_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => trainingLessons.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    prompt: text("prompt").notNull(),
    kind: text("kind").notNull().default("single"), // 'single' | 'multi' | 'true_false'
    // [{id, text}] — option ids are short strings (e.g. "a","b","c") stable
    // across edits so past training_progress answers stay interpretable.
    options: jsonb("options").notNull(),
    correctOptionIds: jsonb("correct_option_ids").notNull(), // string[]
  },
  (t) => ({
    lessonIdx: index("training_quiz_questions_lesson_idx").on(t.lessonId),
  })
);

// Per-person, per-lesson progress. Keyed on the Subsplash profile id (not a
// local user table — this app has none; see ADR-0002/0010) plus an email/
// name snapshot so the admin roster still reads if a profile is later
// merged, same convention as checkIns.profileId/displayName.
export const trainingProgress = pgTable(
  "training_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: text("profile_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => trainingLessons.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => trainingCourses.id, { onDelete: "cascade" }),
    watchedPct: integer("watched_pct").notNull().default(0),
    videoCompletedAt: timestamp("video_completed_at", { withTimezone: true }),
    quizScore: integer("quiz_score"),
    quizPassedAt: timestamp("quiz_passed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePerLesson: unique("training_progress_unique").on(t.profileId, t.lessonId),
    profileIdx: index("training_progress_profile_idx").on(t.profileId),
    courseIdx: index("training_progress_course_idx").on(t.courseId),
  })
);

// Who's allowed to see a course. An admin enrolls someone (People list
// "Invite to training" action, ADR-0023) — a learner only sees courses
// they're enrolled in; a volunteer/admin sees every published course
// without needing a row here (see lib/training.ts's listCoursesForViewer).
export const trainingEnrollments = pgTable(
  "training_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: text("profile_id").notNull(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => trainingCourses.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    invitedBy: text("invited_by").notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => ({
    uniquePerCourse: unique("training_enrollments_unique").on(t.profileId, t.courseId),
    profileIdx: index("training_enrollments_profile_idx").on(t.profileId),
  })
);

// Whole-course status per person, derived from training_progress by
// lib/training.ts's recomputeCourseStatus — also the retry queue for
// syncing to Subsplash (subsplashSyncedStatus lags status until the write
// to the custom field succeeds; subsplashSyncError holds the last failure
// so the admin roster/cron can retry rather than fail silently).
export const trainingCourseStatus = pgTable(
  "training_course_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: text("profile_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => trainingCourses.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("in_progress"), // 'in_progress' | 'completed'
    completedAt: timestamp("completed_at", { withTimezone: true }),
    subsplashSyncedStatus: text("subsplash_synced_status"),
    subsplashSyncError: text("subsplash_sync_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePerCourse: unique("training_course_status_unique").on(t.profileId, t.courseId),
    courseIdx: index("training_course_status_course_idx").on(t.courseId),
  })
);

// Discovered write-metadata (definition id, revision id, dropdown choice
// ids) for a Subsplash custom field, keyed by field name — Subsplash has no
// custom-field-definitions endpoint, so this is learned once (by sampling
// real profiles, or by an admin's "Verify field" click) and reused, rather
// than re-sampled on every write. Generalizes the per-field *FieldMeta
// interfaces already hand-written in lib/subsplash.ts (Campus, DirectoryAccess,
// DirectoryRole, VolunteerNotes) to any field a training course names —
// see lib/subsplash.ts's resolveChoiceFieldMeta.
export const customFieldMetaCache = pgTable("custom_field_meta_cache", {
  fieldName: text("field_name").primaryKey(),
  definitionId: text("definition_id").notNull(),
  revisionId: text("revision_id"),
  type: text("type"),
  choiceIds: jsonb("choice_ids").notNull().default({}), // Record<choiceName, choiceId>
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TrainingCourseRow = typeof trainingCourses.$inferSelect;
export type NewTrainingCourseRow = typeof trainingCourses.$inferInsert;
export type TrainingLessonRow = typeof trainingLessons.$inferSelect;
export type NewTrainingLessonRow = typeof trainingLessons.$inferInsert;
export type TrainingQuizQuestionRow = typeof trainingQuizQuestions.$inferSelect;
export type NewTrainingQuizQuestionRow = typeof trainingQuizQuestions.$inferInsert;
export type TrainingProgressRow = typeof trainingProgress.$inferSelect;
export type NewTrainingProgressRow = typeof trainingProgress.$inferInsert;
export type TrainingEnrollmentRow = typeof trainingEnrollments.$inferSelect;
export type NewTrainingEnrollmentRow = typeof trainingEnrollments.$inferInsert;
export type TrainingCourseStatusRow = typeof trainingCourseStatus.$inferSelect;
export type NewTrainingCourseStatusRow = typeof trainingCourseStatus.$inferInsert;
export type CustomFieldMetaCacheRow = typeof customFieldMetaCache.$inferSelect;
export type NewCustomFieldMetaCacheRow = typeof customFieldMetaCache.$inferInsert;

export type CheckInRow = typeof checkIns.$inferSelect;
export type NewCheckInRow = typeof checkIns.$inferInsert;
// One row per attempted "sync public Subsplash events to Google Calendar"
// run, triggered by the admin-only button on the Events page. Mirrors
// attendanceImports' shape/purpose — the last-run status a status banner on
// the Events page shows.
export const calendarSyncs = pgTable("calendar_syncs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  eventsSeen: integer("events_seen").notNull(),
  eventsCreated: integer("events_created").notNull(),
  eventsUpdated: integer("events_updated").notNull(),
  eventsDeleted: integer("events_deleted").notNull(),
  error: text("error"),
});

export type AttendanceImportRow = typeof attendanceImports.$inferSelect;
export type NewAttendanceImportRow = typeof attendanceImports.$inferInsert;
export type CalendarSyncRow = typeof calendarSyncs.$inferSelect;
export type NewCalendarSyncRow = typeof calendarSyncs.$inferInsert;
export type AccessEventRow = typeof accessEvents.$inferSelect;
export type NewAccessEventRow = typeof accessEvents.$inferInsert;
