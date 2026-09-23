import { describe, expect, it } from "vitest";
import { buildProgressReport, reportToCsvRows } from "./trainingReport";

const d = (s: string) => new Date(s);
const lessons = [
  { id: "l1", title: "Gospel", hasQuiz: true },
  { id: "l2", title: "God", hasQuiz: false },
];
const ann = { profileId: "p1", email: "ann@x.org", displayName: "Ann" };
const bob = { profileId: "p2", email: "bob@x.org", displayName: "=Bob" };
const cy = { profileId: "p3", email: "cy@x.org", displayName: "Cy" };

const report = buildProgressReport({
  course: { id: "c", title: "Membership" },
  lessons,
  enrollments: [ann, bob, cy].map((p) => ({ ...p, invitedAt: d("2026-09-01") })),
  statuses: [
    { ...ann, status: "completed", completedAt: d("2026-09-10"), subsplashSyncedStatus: "completed" },
    { ...bob, status: "in_progress", completedAt: null, subsplashSyncedStatus: null },
  ],
  progress: [
    { profileId: "p1", lessonId: "l1", watchedPct: 100, videoCompletedAt: d("2026-09-09"), quizScore: 90, quizPassedAt: d("2026-09-09"), attempts: 2, updatedAt: d("2026-09-09") },
    { profileId: "p1", lessonId: "l2", watchedPct: 100, videoCompletedAt: d("2026-09-10"), quizScore: null, quizPassedAt: null, attempts: 0, updatedAt: d("2026-09-10") },
    { profileId: "p2", lessonId: "l1", watchedPct: 40, videoCompletedAt: null, quizScore: null, quizPassedAt: null, attempts: 0, updatedAt: d("2026-09-05") },
  ],
});

describe("buildProgressReport", () => {
  it("summarizes statuses, completion rate and quiz average", () => {
    expect(report.summary).toEqual({ total: 3, notStarted: 1, inProgress: 1, completed: 1, completionRate: 33, averageQuizScore: 90 });
  });
  it("builds per-person, per-lesson detail", () => {
    const a = report.rows.find((r) => r.profileId === "p1")!;
    expect(a).toMatchObject({ status: "completed", lessonsCompleted: 2, averageQuizScore: 90, subsplashSynced: true });
    expect(a.lastActivityAt).toContain("2026-09-10");
    const b = report.rows.find((r) => r.profileId === "p2")!;
    expect(b).toMatchObject({ lessonsCompleted: 0, subsplashSynced: false });
    expect(b.lessons[0]).toMatchObject({ watchedPct: 40, complete: false });
    expect(report.rows.find((r) => r.profileId === "p3")).toMatchObject({ status: "invited", lastActivityAt: null });
  });
  it("includes someone with progress but no enrollment", () => {
    const r = buildProgressReport({
      course: { id: "c", title: "T" }, lessons, enrollments: [], statuses: [],
      progress: [{ profileId: "px", lessonId: "l1", watchedPct: 10, videoCompletedAt: null, quizScore: null, quizPassedAt: null, attempts: 0, updatedAt: d("2026-09-02") }],
    });
    expect(r.rows).toHaveLength(1);
  });
});

describe("reportToCsvRows", () => {
  it("emits per-lesson columns (quiz columns only for lessons with a quiz) and neutralizes formulas", () => {
    const { columns, rows } = reportToCsvRows(report);
    const labels = columns.map((c) => c.label);
    expect(labels).toContain("L1 Gospel - Quiz (%)");
    expect(labels).not.toContain("L2 God - Quiz (%)");
    const bobRow = rows.find((r) => r.email === "bob@x.org")!;
    expect(bobRow.name).toBe("'=Bob");
    expect(bobRow.status).toBe("In progress");
    expect(rows.find((r) => r.email === "ann@x.org")!.lessonsCompleted).toBe("2 of 2");
  });
});
