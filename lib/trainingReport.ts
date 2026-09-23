// Pure builder for the per-course progress report (admin roster + CSV export).
// No DB access — lib/training.ts's getProgressReport gathers the inputs.

import { isLessonComplete } from "./trainingLogic";

export interface ReportLessonInput {
  id: string;
  title: string;
  hasQuiz: boolean;
}

export interface ReportProgressInput {
  profileId: string;
  lessonId: string;
  watchedPct: number;
  videoCompletedAt: Date | null;
  quizScore: number | null;
  quizPassedAt: Date | null;
  attempts: number;
  updatedAt: Date;
}

export interface ReportPerson {
  profileId: string;
  email: string;
  displayName: string;
}

export interface ReportInput {
  course: { id: string; title: string };
  lessons: ReportLessonInput[];
  enrollments: Array<ReportPerson & { invitedAt: Date }>;
  statuses: Array<ReportPerson & { status: "in_progress" | "completed"; completedAt: Date | null; subsplashSyncedStatus: string | null }>;
  progress: ReportProgressInput[];
}

export type PersonStatus = "invited" | "in_progress" | "completed";

export interface LessonCell {
  lessonId: string;
  watchedPct: number;
  videoComplete: boolean;
  quizScore: number | null;
  quizPassed: boolean;
  attempts: number;
  complete: boolean;
}

export interface ReportRow {
  profileId: string;
  displayName: string;
  email: string;
  status: PersonStatus;
  invitedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  lessonsCompleted: number;
  // Average of each attempted quiz's best score; null if none attempted.
  averageQuizScore: number | null;
  subsplashSynced: boolean;
  lessons: LessonCell[];
}

export interface ProgressReport {
  course: { id: string; title: string };
  lessons: Array<{ id: string; title: string; hasQuiz: boolean }>;
  summary: {
    total: number;
    notStarted: number;
    inProgress: number;
    completed: number;
    completionRate: number; // 0–100
    averageQuizScore: number | null;
  };
  rows: ReportRow[];
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

export function buildProgressReport(input: ReportInput): ProgressReport {
  const people = new Map<string, ReportPerson & { invitedAt: Date | null }>();
  for (const e of input.enrollments) people.set(e.profileId, { ...e });
  // Someone with progress but no enrollment (a volunteer/admin taking it on
  // their own) still belongs in the report.
  for (const s of input.statuses) if (!people.has(s.profileId)) people.set(s.profileId, { ...s, invitedAt: null });
  for (const p of input.progress) {
    if (!people.has(p.profileId)) people.set(p.profileId, { profileId: p.profileId, email: "", displayName: p.profileId, invitedAt: null });
  }

  const statusBy = new Map(input.statuses.map((s) => [s.profileId, s]));
  const rows: ReportRow[] = Array.from(people.values()).map((person) => {
    const mine = input.progress.filter((p) => p.profileId === person.profileId);
    const byLesson = new Map(mine.map((p) => [p.lessonId, p]));
    const lessons: LessonCell[] = input.lessons.map((l) => {
      const p = byLesson.get(l.id);
      return {
        lessonId: l.id,
        watchedPct: p?.watchedPct ?? 0,
        videoComplete: !!p?.videoCompletedAt,
        quizScore: p?.quizScore ?? null,
        quizPassed: !!p?.quizPassedAt,
        attempts: p?.attempts ?? 0,
        complete: isLessonComplete(p, l.hasQuiz),
      };
    });
    const scores = lessons.map((l) => l.quizScore).filter((x): x is number => x !== null);
    const status = statusBy.get(person.profileId);
    const last = mine.reduce<Date | null>((acc, p) => (!acc || p.updatedAt > acc ? p.updatedAt : acc), null);
    return {
      profileId: person.profileId,
      displayName: person.displayName,
      email: person.email,
      status: status?.status ?? "invited",
      invitedAt: iso(person.invitedAt),
      lastActivityAt: iso(last),
      completedAt: iso(status?.completedAt),
      lessonsCompleted: lessons.filter((l) => l.complete).length,
      averageQuizScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      subsplashSynced: !status || status.subsplashSyncedStatus === status.status,
      lessons,
    };
  });
  rows.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const completed = rows.filter((r) => r.status === "completed").length;
  const inProgress = rows.filter((r) => r.status === "in_progress").length;
  const allScores = rows.map((r) => r.averageQuizScore).filter((x): x is number => x !== null);
  return {
    course: input.course,
    lessons: input.lessons,
    summary: {
      total: rows.length,
      notStarted: rows.length - completed - inProgress,
      inProgress,
      completed,
      completionRate: rows.length ? Math.round((completed / rows.length) * 100) : 0,
      averageQuizScore: allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null,
    },
    rows,
  };
}

const STATUS_LABEL: Record<PersonStatus, string> = { invited: "Not started", in_progress: "In progress", completed: "Completed" };

// A leading = + - @ makes Excel treat a cell as a formula; prefix a quote so
// a name/email copied from the directory can't execute as one.
function safeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const day = (v: string | null) => (v ? v.slice(0, 10) : "");

export function reportToCsvRows(report: ProgressReport): {
  columns: { key: string; label: string }[];
  rows: Record<string, string>[];
} {
  const columns = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "status", label: "Status" },
    { key: "invited", label: "Invited" },
    { key: "lastActivity", label: "Last Activity" },
    { key: "completedAt", label: "Completed" },
    { key: "lessonsCompleted", label: "Lessons Completed" },
    { key: "avgQuiz", label: "Average Quiz Score (%)" },
    ...report.lessons.flatMap((l, i) => [
      { key: `l${i}_watched`, label: `L${i + 1} ${l.title} - Watched (%)` },
      ...(l.hasQuiz
        ? [
            { key: `l${i}_quiz`, label: `L${i + 1} ${l.title} - Quiz (%)` },
            { key: `l${i}_attempts`, label: `L${i + 1} ${l.title} - Attempts` },
          ]
        : []),
    ]),
  ].map((c) => ({ ...c, label: safeCell(c.label) }));

  const rows = report.rows.map((r) => {
    const row: Record<string, string> = {
      name: safeCell(r.displayName),
      email: safeCell(r.email),
      status: STATUS_LABEL[r.status],
      invited: day(r.invitedAt),
      lastActivity: day(r.lastActivityAt),
      completedAt: day(r.completedAt),
      lessonsCompleted: `${r.lessonsCompleted} of ${report.lessons.length}`,
      avgQuiz: r.averageQuizScore === null ? "" : String(r.averageQuizScore),
    };
    report.lessons.forEach((l, i) => {
      const cell = r.lessons[i];
      row[`l${i}_watched`] = String(cell.watchedPct);
      if (l.hasQuiz) {
        row[`l${i}_quiz`] = cell.quizScore === null ? "" : String(cell.quizScore);
        row[`l${i}_attempts`] = String(cell.attempts);
      }
    });
    return row;
  });
  return { columns, rows };
}
