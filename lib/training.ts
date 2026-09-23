// Training courses persistence + orchestration (ADR-0023). Same dual-path
// convention as lib/accessLog.ts / lib/attendance.ts: Neon Postgres via
// Drizzle when DATABASE_URL is set, otherwise an in-memory globalThis store
// so `npm run dev` works with zero setup. Pure rules live in
// lib/trainingLogic.ts.

import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, isDbConfigured } from "./db";
import {
  trainingCourses,
  trainingCourseStatus,
  trainingEnrollments,
  trainingLessons,
  trainingProgress,
  trainingQuizQuestions,
} from "./db/schema";
import { setChoiceCustomField, getDirectoryRole, updateProfile } from "./subsplash";
import { sendBulkEmail } from "./email";
import { buildInviteEmail } from "./trainingEmail";
import { buildProgressReport, type ProgressReport } from "./trainingReport";
import {
  SUBSPLASH_STATUS_LABEL,
  computeCourseStatus,
  computeLessonStates,
  gradeQuiz as gradeQuizPure,
  type CourseStatusValue,
  type QuizOption,
  type QuestionKind,
} from "./trainingLogic";

// --- Types ---

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  audience: "all" | "volunteer";
  published: boolean;
  sortOrder: number;
  subsplashFieldName: string | null;
  passThreshold: number;
}

export interface Lesson {
  id: string;
  courseId: string;
  sortOrder: number;
  title: string;
  description: string | null;
  youtubeVideoId: string;
  minWatchPct: number;
  published: boolean;
}

export interface Question {
  id: string;
  lessonId: string;
  sortOrder: number;
  prompt: string;
  kind: QuestionKind;
  options: QuizOption[];
  correctOptionIds: string[];
}

export interface Progress {
  profileId: string;
  lessonId: string;
  courseId: string;
  email: string;
  displayName: string;
  watchedPct: number;
  videoCompletedAt: Date | null;
  quizScore: number | null;
  quizPassedAt: Date | null;
  attempts: number;
  updatedAt: Date;
}

export interface Enrollment {
  profileId: string;
  courseId: string;
  email: string;
  displayName: string;
  invitedBy: string;
  invitedAt: Date;
  removedAt: Date | null;
}

export interface CourseStatusRow {
  profileId: string;
  courseId: string;
  email: string;
  displayName: string;
  status: CourseStatusValue;
  completedAt: Date | null;
  subsplashSyncedStatus: CourseStatusValue | null;
  subsplashSyncError: string | null;
}

export interface Learner {
  profileId: string;
  email: string;
  displayName: string;
}

// --- In-memory store (dev/test) ---

interface MemStore {
  courses: Course[];
  lessons: Lesson[];
  questions: Question[];
  progress: Progress[];
  enrollments: Enrollment[];
  statuses: CourseStatusRow[];
}

declare global {
  // eslint-disable-next-line no-var
  var __trainingStore: MemStore | undefined;
}

function mem(): MemStore {
  return (globalThis.__trainingStore ??= {
    courses: [],
    lessons: [],
    questions: [],
    progress: [],
    enrollments: [],
    statuses: [],
  });
}

const now = () => new Date();

// --- Courses ---

function courseFromRow(r: typeof trainingCourses.$inferSelect): Course {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    coverImageUrl: r.coverImageUrl,
    audience: r.audience === "volunteer" ? "volunteer" : "all",
    published: r.published,
    sortOrder: r.sortOrder,
    subsplashFieldName: r.subsplashFieldName,
    passThreshold: r.passThreshold,
  };
}

export async function listCourses(): Promise<Course[]> {
  if (isDbConfigured()) {
    const rows = await getDb().select().from(trainingCourses).orderBy(asc(trainingCourses.sortOrder), asc(trainingCourses.title));
    return rows.map(courseFromRow);
  }
  return mem().courses.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

export async function getCourse(idOrSlug: string): Promise<Course | null> {
  const all = await listCourses();
  return all.find((c) => c.id === idOrSlug || c.slug === idOrSlug) ?? null;
}

export type CourseInput = Omit<Course, "id">;

export async function createCourse(input: CourseInput): Promise<Course> {
  if (isDbConfigured()) {
    const [row] = await getDb().insert(trainingCourses).values(input).returning();
    return courseFromRow(row);
  }
  if (mem().courses.some((c) => c.slug === input.slug)) throw new Error("Slug already in use");
  const course: Course = { id: crypto.randomUUID(), ...input };
  mem().courses.push(course);
  return course;
}

export async function updateCourse(id: string, patch: Partial<CourseInput>): Promise<Course | null> {
  if (isDbConfigured()) {
    const [row] = await getDb()
      .update(trainingCourses)
      .set({ ...patch, updatedAt: now() })
      .where(eq(trainingCourses.id, id))
      .returning();
    return row ? courseFromRow(row) : null;
  }
  const c = mem().courses.find((x) => x.id === id);
  if (!c) return null;
  Object.assign(c, patch);
  return c;
}

export async function deleteCourse(id: string): Promise<void> {
  if (isDbConfigured()) {
    await getDb().delete(trainingCourses).where(eq(trainingCourses.id, id));
    return;
  }
  const s = mem();
  const lessonIds = new Set(s.lessons.filter((l) => l.courseId === id).map((l) => l.id));
  s.courses = s.courses.filter((c) => c.id !== id);
  s.lessons = s.lessons.filter((l) => l.courseId !== id);
  s.questions = s.questions.filter((q) => !lessonIds.has(q.lessonId));
  s.progress = s.progress.filter((p) => p.courseId !== id);
  s.enrollments = s.enrollments.filter((e) => e.courseId !== id);
  s.statuses = s.statuses.filter((x) => x.courseId !== id);
}

// --- Lessons ---

function lessonFromRow(r: typeof trainingLessons.$inferSelect): Lesson {
  return { ...r };
}

export async function listLessons(courseId: string, opts: { publishedOnly?: boolean } = {}): Promise<Lesson[]> {
  let lessons: Lesson[];
  if (isDbConfigured()) {
    const rows = await getDb()
      .select()
      .from(trainingLessons)
      .where(eq(trainingLessons.courseId, courseId))
      .orderBy(asc(trainingLessons.sortOrder));
    lessons = rows.map(lessonFromRow);
  } else {
    lessons = mem().lessons.filter((l) => l.courseId === courseId).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return opts.publishedOnly ? lessons.filter((l) => l.published) : lessons;
}

export async function getLesson(id: string): Promise<Lesson | null> {
  if (isDbConfigured()) {
    const [row] = await getDb().select().from(trainingLessons).where(eq(trainingLessons.id, id)).limit(1);
    return row ? lessonFromRow(row) : null;
  }
  return mem().lessons.find((l) => l.id === id) ?? null;
}

export type LessonInput = Omit<Lesson, "id" | "courseId">;

export async function createLesson(courseId: string, input: LessonInput): Promise<Lesson> {
  if (isDbConfigured()) {
    const [row] = await getDb().insert(trainingLessons).values({ courseId, ...input }).returning();
    return lessonFromRow(row);
  }
  const lesson: Lesson = { id: crypto.randomUUID(), courseId, ...input };
  mem().lessons.push(lesson);
  return lesson;
}

export async function updateLesson(id: string, patch: Partial<LessonInput>): Promise<Lesson | null> {
  if (isDbConfigured()) {
    const [row] = await getDb().update(trainingLessons).set(patch).where(eq(trainingLessons.id, id)).returning();
    return row ? lessonFromRow(row) : null;
  }
  const l = mem().lessons.find((x) => x.id === id);
  if (!l) return null;
  Object.assign(l, patch);
  return l;
}

export async function deleteLesson(id: string): Promise<void> {
  if (isDbConfigured()) {
    await getDb().delete(trainingLessons).where(eq(trainingLessons.id, id));
    return;
  }
  const s = mem();
  s.lessons = s.lessons.filter((l) => l.id !== id);
  s.questions = s.questions.filter((q) => q.lessonId !== id);
  s.progress = s.progress.filter((p) => p.lessonId !== id);
}

// --- Quiz questions ---

function questionFromRow(r: typeof trainingQuizQuestions.$inferSelect): Question {
  return {
    id: r.id,
    lessonId: r.lessonId,
    sortOrder: r.sortOrder,
    prompt: r.prompt,
    kind: r.kind as QuestionKind,
    options: r.options as QuizOption[],
    correctOptionIds: r.correctOptionIds as string[],
  };
}

export async function listQuestions(lessonId: string): Promise<Question[]> {
  if (isDbConfigured()) {
    const rows = await getDb()
      .select()
      .from(trainingQuizQuestions)
      .where(eq(trainingQuizQuestions.lessonId, lessonId))
      .orderBy(asc(trainingQuizQuestions.sortOrder));
    return rows.map(questionFromRow);
  }
  return mem().questions.filter((q) => q.lessonId === lessonId).sort((a, b) => a.sortOrder - b.sortOrder);
}

// The editor saves a lesson's whole quiz at once, so this replaces the set
// (delete + insert) rather than diffing question-by-question.
export async function replaceQuestions(
  lessonId: string,
  questions: Array<Omit<Question, "id" | "lessonId" | "sortOrder">>
): Promise<Question[]> {
  if (isDbConfigured()) {
    const db = getDb();
    await db.delete(trainingQuizQuestions).where(eq(trainingQuizQuestions.lessonId, lessonId));
    if (questions.length === 0) return [];
    const rows = await db
      .insert(trainingQuizQuestions)
      .values(questions.map((q, i) => ({ lessonId, sortOrder: i, ...q })))
      .returning();
    return rows.map(questionFromRow);
  }
  const s = mem();
  s.questions = s.questions.filter((q) => q.lessonId !== lessonId);
  const created = questions.map((q, i) => ({ id: crypto.randomUUID(), lessonId, sortOrder: i, ...q }));
  s.questions.push(...created);
  return created;
}

// --- Progress ---

function progressFromRow(r: typeof trainingProgress.$inferSelect): Progress {
  return { ...r };
}

export async function getProgressForCourse(profileId: string, courseId: string): Promise<Progress[]> {
  if (isDbConfigured()) {
    const rows = await getDb()
      .select()
      .from(trainingProgress)
      .where(and(eq(trainingProgress.profileId, profileId), eq(trainingProgress.courseId, courseId)));
    return rows.map(progressFromRow);
  }
  return mem().progress.filter((p) => p.profileId === profileId && p.courseId === courseId);
}

export async function listProgressForCourse(courseId: string): Promise<Progress[]> {
  if (isDbConfigured()) {
    const rows = await getDb().select().from(trainingProgress).where(eq(trainingProgress.courseId, courseId));
    return rows.map(progressFromRow);
  }
  return mem().progress.filter((p) => p.courseId === courseId);
}

async function saveProgress(p: Progress): Promise<void> {
  if (isDbConfigured()) {
    await getDb()
      .insert(trainingProgress)
      .values({ ...p, updatedAt: now() })
      .onConflictDoUpdate({
        target: [trainingProgress.profileId, trainingProgress.lessonId],
        set: {
          watchedPct: p.watchedPct,
          videoCompletedAt: p.videoCompletedAt,
          quizScore: p.quizScore,
          quizPassedAt: p.quizPassedAt,
          attempts: p.attempts,
          updatedAt: now(),
        },
      });
    return;
  }
  const s = mem();
  p.updatedAt = now();
  const i = s.progress.findIndex((x) => x.profileId === p.profileId && x.lessonId === p.lessonId);
  if (i >= 0) s.progress[i] = p;
  else s.progress.push(p);
}

function blankProgress(learner: Learner, lesson: Lesson): Progress {
  return {
    profileId: learner.profileId,
    email: learner.email,
    displayName: learner.displayName,
    lessonId: lesson.id,
    courseId: lesson.courseId,
    watchedPct: 0,
    videoCompletedAt: null,
    quizScore: null,
    quizPassedAt: null,
    attempts: 0,
    updatedAt: now(),
  };
}

// --- Enrollments ---

function enrollmentFromRow(r: typeof trainingEnrollments.$inferSelect): Enrollment {
  return { ...r };
}

export async function listEnrollmentsForProfile(profileId: string): Promise<Enrollment[]> {
  if (isDbConfigured()) {
    const rows = await getDb()
      .select()
      .from(trainingEnrollments)
      .where(and(eq(trainingEnrollments.profileId, profileId), isNull(trainingEnrollments.removedAt)));
    return rows.map(enrollmentFromRow);
  }
  return mem().enrollments.filter((e) => e.profileId === profileId && !e.removedAt);
}

export async function listEnrollmentsForCourse(courseId: string): Promise<Enrollment[]> {
  if (isDbConfigured()) {
    const rows = await getDb()
      .select()
      .from(trainingEnrollments)
      .where(and(eq(trainingEnrollments.courseId, courseId), isNull(trainingEnrollments.removedAt)));
    return rows.map(enrollmentFromRow);
  }
  return mem().enrollments.filter((e) => e.courseId === courseId && !e.removedAt);
}

async function upsertEnrollment(e: Omit<Enrollment, "invitedAt" | "removedAt">): Promise<void> {
  if (isDbConfigured()) {
    await getDb()
      .insert(trainingEnrollments)
      .values(e)
      .onConflictDoUpdate({
        target: [trainingEnrollments.profileId, trainingEnrollments.courseId],
        set: { removedAt: null, email: e.email, displayName: e.displayName },
      });
    return;
  }
  const s = mem();
  const existing = s.enrollments.find((x) => x.profileId === e.profileId && x.courseId === e.courseId);
  if (existing) {
    existing.removedAt = null;
    existing.email = e.email;
    existing.displayName = e.displayName;
  } else {
    s.enrollments.push({ ...e, invitedAt: now(), removedAt: null });
  }
}

export async function removeEnrollment(profileId: string, courseId: string): Promise<void> {
  if (isDbConfigured()) {
    await getDb()
      .update(trainingEnrollments)
      .set({ removedAt: now() })
      .where(and(eq(trainingEnrollments.profileId, profileId), eq(trainingEnrollments.courseId, courseId)));
    return;
  }
  const e = mem().enrollments.find((x) => x.profileId === profileId && x.courseId === courseId);
  if (e) e.removedAt = now();
}

// --- Course status + Subsplash sync ---

function statusFromRow(r: typeof trainingCourseStatus.$inferSelect): CourseStatusRow {
  return {
    profileId: r.profileId,
    courseId: r.courseId,
    email: r.email,
    displayName: r.displayName,
    status: r.status as CourseStatusValue,
    completedAt: r.completedAt,
    subsplashSyncedStatus: (r.subsplashSyncedStatus as CourseStatusValue | null) ?? null,
    subsplashSyncError: r.subsplashSyncError,
  };
}

export async function getCourseStatus(profileId: string, courseId: string): Promise<CourseStatusRow | null> {
  if (isDbConfigured()) {
    const [row] = await getDb()
      .select()
      .from(trainingCourseStatus)
      .where(and(eq(trainingCourseStatus.profileId, profileId), eq(trainingCourseStatus.courseId, courseId)))
      .limit(1);
    return row ? statusFromRow(row) : null;
  }
  return mem().statuses.find((x) => x.profileId === profileId && x.courseId === courseId) ?? null;
}

export async function listCourseStatuses(courseId: string): Promise<CourseStatusRow[]> {
  if (isDbConfigured()) {
    const rows = await getDb().select().from(trainingCourseStatus).where(eq(trainingCourseStatus.courseId, courseId));
    return rows.map(statusFromRow);
  }
  return mem().statuses.filter((x) => x.courseId === courseId);
}

async function saveStatus(row: CourseStatusRow): Promise<void> {
  if (isDbConfigured()) {
    await getDb()
      .insert(trainingCourseStatus)
      .values({ ...row, updatedAt: now() })
      .onConflictDoUpdate({
        target: [trainingCourseStatus.profileId, trainingCourseStatus.courseId],
        set: {
          status: row.status,
          completedAt: row.completedAt,
          subsplashSyncedStatus: row.subsplashSyncedStatus,
          subsplashSyncError: row.subsplashSyncError,
          updatedAt: now(),
        },
      });
    return;
  }
  const s = mem();
  const i = s.statuses.findIndex((x) => x.profileId === row.profileId && x.courseId === row.courseId);
  if (i >= 0) s.statuses[i] = row;
  else s.statuses.push(row);
}

// Writes the row's current status to the course's Subsplash field. Never
// throws: a failure is stored on the row (subsplashSyncError) so the admin
// roster shows it and a retry can pick it up — a Subsplash outage or an
// undiscovered choice id must never fail the learner's own request.
async function syncStatusToSubsplash(course: Course, row: CourseStatusRow): Promise<CourseStatusRow> {
  if (!course.subsplashFieldName) return row;
  try {
    await setChoiceCustomField(row.profileId, course.subsplashFieldName, SUBSPLASH_STATUS_LABEL[row.status]);
    return { ...row, subsplashSyncedStatus: row.status, subsplashSyncError: null };
  } catch (err) {
    console.error("Training: Subsplash sync failed", err);
    return { ...row, subsplashSyncError: err instanceof Error ? err.message : "Sync failed" };
  }
}

// Recomputes a person's course status from their lesson progress and, when
// it changed (or a previous sync is still pending), writes it to Subsplash.
export async function recomputeCourseStatus(learner: Learner, courseId: string): Promise<CourseStatusRow | null> {
  const course = await getCourse(courseId);
  if (!course) return null;
  const lessons = await listLessons(courseId, { publishedOnly: true });
  const withQuiz = await Promise.all(
    lessons.map(async (l) => ({ id: l.id, hasQuiz: (await listQuestions(l.id)).length > 0 }))
  );
  const progress = await getProgressForCourse(learner.profileId, courseId);
  const byLesson = Object.fromEntries(progress.map((p) => [p.lessonId, p]));
  const status = computeCourseStatus(withQuiz, byLesson);
  if (!status) return null;

  const existing = await getCourseStatus(learner.profileId, courseId);
  let row: CourseStatusRow = {
    profileId: learner.profileId,
    courseId,
    email: learner.email,
    displayName: learner.displayName,
    status,
    completedAt: status === "completed" ? (existing?.completedAt ?? now()) : null,
    subsplashSyncedStatus: existing?.subsplashSyncedStatus ?? null,
    subsplashSyncError: existing?.subsplashSyncError ?? null,
  };
  if (row.subsplashSyncedStatus !== status) {
    row = await syncStatusToSubsplash(course, row);
  }
  await saveStatus(row);
  return row;
}

// Admin "resync": retries every status row whose Subsplash value lags.
export async function resyncCourse(courseId: string): Promise<{ attempted: number; failed: number }> {
  const course = await getCourse(courseId);
  if (!course) return { attempted: 0, failed: 0 };
  const rows = (await listCourseStatuses(courseId)).filter((r) => r.subsplashSyncedStatus !== r.status);
  let failed = 0;
  for (const r of rows) {
    const next = await syncStatusToSubsplash(course, r);
    if (next.subsplashSyncError) failed += 1;
    await saveStatus(next);
  }
  return { attempted: rows.length, failed };
}

// --- Learner-facing operations ---

// Whether `learner` may see/take `course`. Admin/staff/volunteer see every
// published course whose audience allows it; a learner only sees courses
// they're enrolled in (and never volunteer-only ones).
export async function canAccessCourse(
  actor: { role: string; profileId?: string },
  course: Course
): Promise<boolean> {
  if (!course.published) return actor.role === "admin";
  if (actor.role === "admin" || actor.role === "staff") return true;
  if (actor.role === "volunteer") return true;
  if (actor.role === "learner") {
    if (course.audience === "volunteer" || !actor.profileId) return false;
    const enrollments = await listEnrollmentsForProfile(actor.profileId);
    return enrollments.some((e) => e.courseId === course.id);
  }
  return false;
}

export interface CourseSummary {
  course: Course;
  lessonCount: number;
  completedLessons: number;
  status: CourseStatusValue | "not_started";
}

export async function listCoursesForViewer(actor: { role: string; profileId?: string }): Promise<CourseSummary[]> {
  const courses = await listCourses();
  const out: CourseSummary[] = [];
  for (const course of courses) {
    // Admins also see unpublished courses (marked as such in the UI).
    if (!(await canAccessCourse(actor, course))) continue;
    const lessons = await listLessons(course.id, { publishedOnly: true });
    const withQuiz = await Promise.all(
      lessons.map(async (l) => ({ id: l.id, hasQuiz: (await listQuestions(l.id)).length > 0 }))
    );
    const progress = actor.profileId ? await getProgressForCourse(actor.profileId, course.id) : [];
    const states = computeLessonStates(withQuiz, Object.fromEntries(progress.map((p) => [p.lessonId, p])));
    const completedLessons = states.filter((s) => s.complete).length;
    const status = actor.profileId ? await getCourseStatus(actor.profileId, course.id) : null;
    out.push({
      course,
      lessonCount: lessons.length,
      completedLessons,
      status: status?.status ?? "not_started",
    });
  }
  return out;
}

export interface LessonView {
  lesson: Omit<Lesson, "courseId">;
  complete: boolean;
  locked: boolean;
  watchedPct: number;
  videoComplete: boolean;
  quizScore: number | null;
  quizPassed: boolean;
  // Answer keys are never included — only prompt/kind/options.
  questions: Array<Pick<Question, "id" | "prompt" | "kind" | "options">>;
}

export interface CourseView {
  course: Course;
  status: CourseStatusValue | "not_started";
  completedAt: Date | null;
  lessons: LessonView[];
}

export async function getCourseView(actor: { role: string; profileId?: string }, slug: string): Promise<CourseView | null> {
  const course = await getCourse(slug);
  if (!course || !(await canAccessCourse(actor, course))) return null;
  const lessons = await listLessons(course.id, { publishedOnly: actor.role !== "admin" ? true : false });
  const questionsByLesson = new Map<string, Question[]>();
  for (const l of lessons) questionsByLesson.set(l.id, await listQuestions(l.id));
  const progress = actor.profileId ? await getProgressForCourse(actor.profileId, course.id) : [];
  const byLesson = Object.fromEntries(progress.map((p) => [p.lessonId, p]));
  const states = computeLessonStates(
    lessons.map((l) => ({ id: l.id, hasQuiz: (questionsByLesson.get(l.id) ?? []).length > 0 })),
    byLesson
  );
  const status = actor.profileId ? await getCourseStatus(actor.profileId, course.id) : null;
  return {
    course,
    status: status?.status ?? "not_started",
    completedAt: status?.completedAt ?? null,
    lessons: lessons.map((l, i) => {
      const p = byLesson[l.id];
      const { courseId: _courseId, ...lessonPublic } = l;
      void _courseId;
      return {
        lesson: lessonPublic,
        complete: states[i].complete,
        locked: states[i].locked,
        watchedPct: p?.watchedPct ?? 0,
        videoComplete: !!p?.videoCompletedAt,
        quizScore: p?.quizScore ?? null,
        quizPassed: !!p?.quizPassedAt,
        questions: (questionsByLesson.get(l.id) ?? []).map((q) => ({
          id: q.id,
          prompt: q.prompt,
          kind: q.kind,
          options: q.options,
        })),
      };
    }),
  };
}

export class TrainingError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

interface LearnerActor {
  role: string;
  profileId?: string;
  email: string;
  name: string | null;
}

async function loadLessonForLearner(actor: LearnerActor, lessonId: string) {
  if (!actor.profileId) throw new TrainingError("No directory profile is linked to your email", 400);
  const lesson = await getLesson(lessonId);
  if (!lesson) throw new TrainingError("Lesson not found", 404);
  const course = await getCourse(lesson.courseId);
  if (!course || !(await canAccessCourse(actor, course))) throw new TrainingError("Lesson not found", 404);
  const view = await getCourseView(actor, course.id);
  const state = view?.lessons.find((l) => l.lesson.id === lessonId);
  if (!state || state.locked) throw new TrainingError("Complete the previous lesson first", 403);
  const learner: Learner = {
    profileId: actor.profileId,
    email: actor.email,
    displayName: actor.name ?? actor.email,
  };
  return { lesson, course, learner };
}

// Records how far a learner has watched. Only ever increases; reaching
// min_watch_pct marks the video complete.
export async function recordWatch(actor: LearnerActor, lessonId: string, pct: number): Promise<void> {
  const { lesson, learner } = await loadLessonForLearner(actor, lessonId);
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const existing = (await getProgressForCourse(learner.profileId, lesson.courseId)).find((p) => p.lessonId === lesson.id);
  const p = existing ?? blankProgress(learner, lesson);
  p.watchedPct = Math.max(p.watchedPct, clamped);
  if (!p.videoCompletedAt && p.watchedPct >= lesson.minWatchPct) p.videoCompletedAt = now();
  await saveProgress(p);
  await recomputeCourseStatus(learner, lesson.courseId);
}

export interface QuizResult {
  score: number;
  passed: boolean;
  perQuestion: Record<string, boolean>;
}

export async function submitQuiz(
  actor: LearnerActor,
  lessonId: string,
  answers: Record<string, string[]>
): Promise<QuizResult> {
  const { lesson, course, learner } = await loadLessonForLearner(actor, lessonId);
  const questions = await listQuestions(lesson.id);
  if (questions.length === 0) throw new TrainingError("This lesson has no quiz", 400);
  const existing = (await getProgressForCourse(learner.profileId, lesson.courseId)).find((p) => p.lessonId === lesson.id);
  // The quiz follows the video — grading before it's watched would let a
  // learner skip straight to answers.
  if (!existing?.videoCompletedAt) throw new TrainingError("Watch the video first", 403);
  const result = gradeQuizPure(questions, answers, course.passThreshold);
  const p = existing;
  p.attempts += 1;
  p.quizScore = Math.max(p.quizScore ?? 0, result.score);
  if (result.passed && !p.quizPassedAt) p.quizPassedAt = now();
  await saveProgress(p);
  await recomputeCourseStatus(learner, lesson.courseId);
  return result;
}

// --- Admin invites ---

export interface InviteResult {
  profileId: string;
  status: "invited" | "skipped";
  roleSet?: boolean;
  reason?: string;
}

export interface InvitePerson {
  id: string;
  email?: string;
  first_name: string;
  last_name: string;
  directory_access?: boolean;
  directory_role?: string;
}

// Enrolls each person in each course. Someone with no DirectoryAccess and no
// DirectoryRole gets DirectoryRole "Learner" so they can sign in (lib/auth.ts);
// anyone who already has access is never downgraded or changed.
export async function inviteToTraining(params: {
  people: InvitePerson[];
  courseIds: string[];
  invitedBy: string;
  sendEmail: boolean;
  fromName: string;
  replyTo: string;
  appUrl: string;
}): Promise<{ results: InviteResult[]; emailed: number; emailError?: string }> {
  const courses = (await Promise.all(params.courseIds.map((id) => getCourse(id)))).filter(
    (c): c is Course => !!c
  );
  if (courses.length === 0) throw new TrainingError("Pick at least one course", 400);

  const results: InviteResult[] = [];
  const emails: string[] = [];
  for (const person of params.people) {
    const email = person.email?.trim();
    if (!email) {
      results.push({ profileId: person.id, status: "skipped", reason: "No email on the profile" });
      continue;
    }
    // A live lookup rather than trusting the (up to 5-minute cached) list
    // row, so a just-granted role isn't clobbered.
    const currentRole = await getDirectoryRole(email);
    let roleSet = false;
    if (!person.directory_access && !currentRole) {
      try {
        await updateProfile(person.id, { directory_role: "Learner" });
        roleSet = true;
      } catch (err) {
        results.push({
          profileId: person.id,
          status: "skipped",
          reason: err instanceof Error ? err.message : "Could not set DirectoryRole to Learner",
        });
        continue;
      }
    }
    for (const course of courses) {
      await upsertEnrollment({
        profileId: person.id,
        courseId: course.id,
        email,
        displayName: `${person.first_name} ${person.last_name}`.trim(),
        invitedBy: params.invitedBy,
      });
    }
    results.push({ profileId: person.id, status: "invited", roleSet });
    emails.push(email);
  }

  let emailed = 0;
  let emailError: string | undefined;
  if (params.sendEmail && emails.length > 0) {
    const { subject, html } = buildInviteEmail({
      courseTitles: courses.map((c) => c.title),
      trainingUrl: `${params.appUrl}/training`,
      logoUrl: `${params.appUrl}/stsa-logo.png`,
      invitedByName: params.fromName,
    });
    try {
      await sendBulkEmail({
        bcc: emails,
        fromName: params.fromName,
        replyTo: params.replyTo,
        subject,
        html,
      });
      emailed = emails.length;
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Email failed";
    }
  }
  return { results, emailed, emailError };
}

// --- Admin roster ---

export interface RosterRow {
  profileId: string;
  email: string;
  displayName: string;
  status: CourseStatusValue | "invited";
  completedAt: Date | null;
  subsplashSynced: boolean;
  subsplashSyncError: string | null;
}

export async function getRoster(courseId: string): Promise<RosterRow[]> {
  const [statuses, enrollments] = await Promise.all([listCourseStatuses(courseId), listEnrollmentsForCourse(courseId)]);
  const byProfile = new Map<string, RosterRow>();
  for (const e of enrollments) {
    byProfile.set(e.profileId, {
      profileId: e.profileId,
      email: e.email,
      displayName: e.displayName,
      status: "invited",
      completedAt: null,
      subsplashSynced: true,
      subsplashSyncError: null,
    });
  }
  for (const s of statuses) {
    byProfile.set(s.profileId, {
      profileId: s.profileId,
      email: s.email,
      displayName: s.displayName,
      status: s.status,
      completedAt: s.completedAt,
      subsplashSynced: s.subsplashSyncedStatus === s.status,
      subsplashSyncError: s.subsplashSyncError,
    });
  }
  return Array.from(byProfile.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// --- Progress report ---

export async function getProgressReport(courseId: string): Promise<ProgressReport | null> {
  const course = await getCourse(courseId);
  if (!course) return null;
  const lessons = await listLessons(courseId, { publishedOnly: true });
  const withQuiz = await Promise.all(
    lessons.map(async (l) => ({ id: l.id, title: l.title, hasQuiz: (await listQuestions(l.id)).length > 0 }))
  );
  const [enrollments, statuses, progress] = await Promise.all([
    listEnrollmentsForCourse(courseId),
    listCourseStatuses(courseId),
    listProgressForCourse(courseId),
  ]);
  return buildProgressReport({ course: { id: course.id, title: course.title }, lessons: withQuiz, enrollments, statuses, progress });
}
