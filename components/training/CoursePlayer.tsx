"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, Lock, PartyPopper } from "lucide-react";
import { useSWRConfig } from "swr";
import { useCourseView, sendJson } from "@/hooks/useTraining";
import { YouTubeLesson } from "@/components/training/YouTubeLesson";
import { LessonQuiz } from "@/components/training/LessonQuiz";

export function CoursePlayer({ slug }: { slug: string }) {
  const { data, error, mutate } = useCourseView(slug);
  const { mutate: globalMutate } = useSWRConfig();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastSent = useRef<Record<string, number>>({});

  if (error) return <p className="text-sm text-red-700">Could not load this course.</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { course, lessons } = data;
  // Default to the first lesson that isn't complete yet.
  const current =
    lessons.find((l) => l.lesson.id === selectedId) ?? lessons.find((l) => !l.complete && !l.locked) ?? lessons[0];

  async function reportProgress(lessonId: string, pct: number) {
    const rounded = Math.round(pct);
    if (rounded <= (lastSent.current[lessonId] ?? -1)) return;
    lastSent.current[lessonId] = rounded;
    try {
      const r = (await sendJson(`/api/training/lessons/${lessonId}/watch`, "POST", { pct: rounded })) as {
        needsSync?: boolean;
      };
      if (r.needsSync) void fetch(`/api/training/lessons/${lessonId}/sync`, { method: "POST" }).catch(() => {});
      await mutate();
      globalMutate("/api/training/courses");
    } catch {
      // Best-effort; the next tick retries.
    }
  }

  return (
    <div>
      <Link href="/training" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All courses
      </Link>
      <h1 className="font-heading text-[22px] font-semibold text-brand-navy">{course.title}</h1>
      {course.description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{course.description}</p>}

      {data.status === "completed" && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 p-4 text-sm font-medium text-green-800">
          <PartyPopper className="h-5 w-5" />
          Course completed
          {data.completedAt ? ` on ${new Date(data.completedAt).toLocaleDateString()}` : ""}. Thank you!
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <nav className="space-y-1">
          {lessons.map((l, i) => (
            <button
              key={l.lesson.id}
              disabled={l.locked}
              onClick={() => setSelectedId(l.lesson.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                current?.lesson.id === l.lesson.id ? "bg-brand-sky/20 font-semibold" : "hover:bg-muted"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {l.complete ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              ) : l.locked ? (
                <Lock className="h-4 w-4 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 shrink-0" />
              )}
              <span>
                {i + 1}. {l.lesson.title}
              </span>
            </button>
          ))}
          {lessons.length === 0 && <p className="text-sm text-muted-foreground">No lessons yet.</p>}
        </nav>

        {current && (
          <section className="min-w-0 space-y-6">
            <h2 className="font-heading text-lg font-semibold">{current.lesson.title}</h2>
            <YouTubeLesson
              key={current.lesson.id}
              videoId={current.lesson.youtubeVideoId}
              initialPct={current.watchedPct}
              unrestricted={current.videoComplete}
              onProgress={(pct) => reportProgress(current.lesson.id, pct)}
            />
            <p className="text-xs text-muted-foreground">
              {current.videoComplete
                ? "Video complete."
                : `Watch at least ${current.lesson.minWatchPct}% of the video to continue (${current.watchedPct}% so far). Skipping ahead isn't allowed.`}
            </p>
            {current.lesson.description && (
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: current.lesson.description }} />
            )}
            {current.questions.length > 0 && current.videoComplete && (
              <LessonQuiz
                key={current.lesson.id}
                lesson={current}
                onDone={() => {
                  mutate();
                  globalMutate("/api/training/courses");
                }}
              />
            )}
            {current.questions.length > 0 && !current.videoComplete && (
              <p className="text-sm text-muted-foreground">The quiz unlocks after you finish the video.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
