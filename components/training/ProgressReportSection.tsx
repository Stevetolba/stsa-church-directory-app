"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProgressReport } from "@/hooks/useTraining";
import { ResetProgressButton } from "@/components/training/ResetProgressButton";
import { UpdateSubsplashButton } from "@/components/training/UpdateSubsplashButton";
import { downloadCsv, toCsv } from "@/lib/csv";
import { reportToCsvRows } from "@/lib/trainingReport";

const STATUS_STYLE = {
  invited: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
} as const;
const STATUS_LABEL = { invited: "Not started", in_progress: "In progress", completed: "Completed" } as const;

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/60 px-4 py-3">
      <div className="text-2xl font-semibold text-brand-navy">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// Admin progress report for a course: summary numbers, a per-person table
// with each lesson's watch/quiz state, and a CSV export of the same data.
export function ProgressReportSection({ courseId }: { courseId: string }) {
  const { data, error, mutate } = useProgressReport(courseId);

  function exportCsv() {
    if (!data) return;
    const { columns, rows } = reportToCsvRows(data);
    const slug = data.course.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    downloadCsv(`training-${slug || "course"}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, columns));
  }

  return (
    <section className="space-y-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">Progress report</h2>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data || data.rows.length === 0}>
          <Download /> Export CSV
        </Button>
      </div>
      {error && <p className="text-sm text-red-700">Could not load the report.</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="People" value={data.summary.total} />
            <Stat label="Not started" value={data.summary.notStarted} />
            <Stat label="In progress" value={data.summary.inProgress} />
            <Stat label="Completed" value={`${data.summary.completed} (${data.summary.completionRate}%)`} />
            <Stat label="Avg quiz score" value={data.summary.averageQuizScore === null ? "—" : `${data.summary.averageQuizScore}%`} />
          </div>
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one has been invited or started this course yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Person</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Lessons</th>
                    {data.lessons.map((l, i) => (
                      <th key={l.id} className="py-2 pr-3" title={l.title}>
                        L{i + 1}
                      </th>
                    ))}
                    <th className="py-2 pr-3">Avg quiz</th>
                    <th className="py-2 pr-3">Last activity</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.rows.map((r) => (
                    <tr key={r.profileId}>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.displayName}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        {!r.subsplashSynced && (
                          <div className="mt-1 flex flex-col items-start gap-1">
                            <span className="text-[11px] text-amber-700">Subsplash pending</span>
                            <UpdateSubsplashButton courseId={courseId} profileId={r.profileId} onDone={() => mutate()} />
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {r.lessonsCompleted}/{data.lessons.length}
                      </td>
                      {r.lessons.map((c, i) => (
                        <td
                          key={c.lessonId}
                          className="py-2 pr-3 text-xs"
                          title={`Watched ${c.watchedPct}%${c.quizScore !== null ? `, quiz ${c.quizScore}% (${c.attempts} tries)` : ""}`}
                        >
                          {c.complete ? (
                            <span className="text-green-700">✓{c.quizScore !== null ? ` ${c.quizScore}%` : ""}</span>
                          ) : c.watchedPct > 0 ? (
                            <span className="text-amber-700">{c.watchedPct}%</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          <span className="sr-only">{data.lessons[i].title}</span>
                        </td>
                      ))}
                      <td className="py-2 pr-3">{r.averageQuizScore === null ? "—" : `${r.averageQuizScore}%`}</td>
                      <td className="py-2 pr-3">{fmtDate(r.lastActivityAt)}</td>
                      <td className="py-2">
                        {r.status !== "invited" && (
                          <ResetProgressButton
                            courseId={courseId}
                            profileId={r.profileId}
                            name={r.displayName}
                            onDone={() => mutate()}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
