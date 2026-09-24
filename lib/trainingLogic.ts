// Pure training rules (grading, lesson completion/unlock, course status) —
// no DB or Subsplash access, so they're unit-testable (lib/trainingLogic.test.ts)
// and shared by lib/training.ts's persistence layer.

export type QuestionKind = "single" | "multi" | "true_false";

export interface QuizOption {
  id: string;
  text: string;
}

export interface GradableQuestion {
  id: string;
  correctOptionIds: string[];
}

export interface LessonProgress {
  watchedPct: number;
  videoCompletedAt: Date | string | null;
  quizPassedAt: Date | string | null;
}

export type CourseStatusValue = "in_progress" | "completed";

// A question is right only on an exact match of the selected set — for a
// "multi" question, missing or extra picks are both wrong (no partial
// credit), which keeps the score explainable to a learner.
export function isAnswerCorrect(question: GradableQuestion, selected: string[] | undefined): boolean {
  const picked = new Set(selected ?? []);
  const correct = new Set(question.correctOptionIds);
  if (picked.size !== correct.size) return false;
  return Array.from(picked).every((id) => correct.has(id));
}

export interface GradeResult {
  score: number; // 0–100, rounded
  passed: boolean;
  perQuestion: Record<string, boolean>;
}

export function gradeQuiz(
  questions: GradableQuestion[],
  answers: Record<string, string[]>,
  passThreshold: number
): GradeResult {
  const perQuestion: Record<string, boolean> = {};
  let correct = 0;
  for (const q of questions) {
    const ok = isAnswerCorrect(q, answers[q.id]);
    perQuestion[q.id] = ok;
    if (ok) correct += 1;
  }
  const score = questions.length === 0 ? 100 : Math.round((correct / questions.length) * 100);
  return { score, passed: score >= passThreshold, perQuestion };
}

// A lesson is complete once its video is (watched to min_watch_pct) AND its
// quiz is passed — or immediately after the video when it has no quiz.
export function isLessonComplete(progress: LessonProgress | undefined, hasQuiz: boolean): boolean {
  if (!progress?.videoCompletedAt) return false;
  return hasQuiz ? !!progress.quizPassedAt : true;
}

export interface LessonState {
  id: string;
  complete: boolean;
  // Lessons unlock in order: N+1 opens once N is complete.
  locked: boolean;
}

export function computeLessonStates(
  lessons: Array<{ id: string; hasQuiz: boolean }>,
  progressByLesson: Record<string, LessonProgress | undefined>
): LessonState[] {
  let previousComplete = true;
  return lessons.map((l) => {
    const complete = isLessonComplete(progressByLesson[l.id], l.hasQuiz);
    const state = { id: l.id, complete, locked: !previousComplete };
    previousComplete = complete;
    return state;
  });
}

// null = no activity yet (no status row should exist).
export function computeCourseStatus(
  lessons: Array<{ id: string; hasQuiz: boolean }>,
  progressByLesson: Record<string, LessonProgress | undefined>
): CourseStatusValue | null {
  if (lessons.length === 0) return null;
  const states = computeLessonStates(lessons, progressByLesson);
  if (states.every((s) => s.complete)) return "completed";
  const anyActivity = lessons.some((l) => {
    const p = progressByLesson[l.id];
    return !!p && (p.watchedPct > 0 || !!p.videoCompletedAt || !!p.quizPassedAt);
  });
  return anyActivity ? "in_progress" : null;
}

// The choice name written to the Subsplash course field.
// Written to the Subsplash field when an admin resets someone's progress.
export const SUBSPLASH_NOT_STARTED_LABEL = "Not Started";

export const SUBSPLASH_STATUS_LABEL: Record<CourseStatusValue, string> = {
  in_progress: "In Progress",
  completed: "Completed",
};

// URL-friendly lesson names for /training/<course>?lesson=<slug>. Unique
// within a course: a repeated name gets -2, -3, … appended.
export function lessonSlugs(titles: string[]): string[] {
  const seen = new Map<string, number>();
  return titles.map((title, i) => {
    const base =
      title
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `lesson-${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}
