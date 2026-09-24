"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/hooks/useTraining";
import type { LessonView, QuizResult } from "@/lib/training";

// Renders a lesson's quiz. Answer keys never reach the browser — grading is
// POST /api/training/lessons/[id]/quiz, which returns per-question
// right/wrong only. Retries are unlimited.
export function LessonQuiz({ lesson, onDone }: { lesson: LessonView; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(qid: string, oid: string, multi: boolean) {
    setResult(null);
    setAnswers((prev) => {
      const cur = prev[qid] ?? [];
      if (!multi) return { ...prev, [qid]: [oid] };
      return { ...prev, [qid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] };
    });
  }

  async function submit() {
    setBusy(true);
    try {
      const r = (await sendJson(`/api/training/lessons/${lesson.lesson.id}/quiz`, "POST", { answers })) as QuizResult;
      setResult(r);
      // Subsplash is updated after the result is on screen, not before.
      if (r.needsSync) void fetch(`/api/training/lessons/${lesson.lesson.id}/sync`, { method: "POST" }).catch(() => {});
      if (r.passed) toast.success(`Passed with ${r.score}%`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit quiz");
    } finally {
      setBusy(false);
    }
  }

  const allAnswered = lesson.questions.every((q) => (answers[q.id]?.length ?? 0) > 0);

  return (
    <div className="space-y-5">
      <h3 className="font-heading text-lg font-semibold text-brand-navy">Quiz</h3>
      {lesson.questions.map((q, i) => (
        <fieldset key={q.id} className="space-y-2">
          <legend className="text-sm font-semibold">
            {i + 1}. {q.prompt}
            {q.kind === "multi" && <span className="ml-2 text-xs font-normal text-muted-foreground">(select all that apply)</span>}
            {result && (
              <span className={`ml-2 text-xs ${result.perQuestion[q.id] ? "text-green-700" : "text-red-700"}`}>
                {result.perQuestion[q.id] ? "Correct" : "Try again"}
              </span>
            )}
          </legend>
          {q.options.map((o) => {
            const checked = answers[q.id]?.includes(o.id) ?? false;
            return (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                <input
                  type={q.kind === "multi" ? "checkbox" : "radio"}
                  name={q.id}
                  checked={checked}
                  onChange={() => toggle(q.id, o.id, q.kind === "multi")}
                />
                {o.text}
              </label>
            );
          })}
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={busy || !allAnswered}>
          {result ? "Resubmit" : "Submit answers"}
        </Button>
        {result && (
          <span className={`text-sm font-medium ${result.passed ? "text-green-700" : "text-red-700"}`}>
            {result.passed ? `Passed — ${result.score}%` : `${result.score}% — you need a higher score, review and try again`}
          </span>
        )}
      </div>
    </div>
  );
}
