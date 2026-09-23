"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvitePeopleDialog } from "@/components/training/InvitePeopleDialog";
import { Input } from "@/components/ui/input";
import { sendJson, useAdminCourse, useRoster, type AdminLesson } from "@/hooks/useTraining";
import { extractYoutubeVideoId } from "@/lib/youtube";
import type { Course } from "@/lib/training";

const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground";

function CourseSettings({ course, onSaved }: { course: Course; onSaved: () => void }) {
  const [f, setF] = useState(course);
  const [verify, setVerify] = useState<string | null>(null);
  useEffect(() => setF(course), [course]);

  async function save() {
    try {
      await sendJson(`/api/admin/training/courses/${course.id}`, "PATCH", {
        title: f.title,
        slug: f.slug,
        description: f.description ?? "",
        coverImageUrl: f.coverImageUrl ?? "",
        audience: f.audience,
        published: f.published,
        subsplashFieldName: f.subsplashFieldName ?? "",
        passThreshold: f.passThreshold,
      });
      toast.success("Course saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function verifyField() {
    try {
      const r = await sendJson(`/api/admin/training/courses/${course.id}/verify-field`, "POST");
      setVerify(
        r.fieldFound
          ? r.choicesMissing.length === 0
            ? "Field found — both choices are known. Progress will sync."
            : `Field found, but no profile has set: ${r.choicesMissing.join(", ")}. Set each once on a test profile in Subsplash, then verify again.`
          : `Field "${r.fieldName}" wasn't found on any profile. Create it in Subsplash and set a value once on a test profile.`
      );
    } catch (err) {
      setVerify(err instanceof Error ? err.message : "Verification failed");
    }
  }

  return (
    <section className="space-y-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <h2 className="font-heading text-lg font-semibold">Course</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={label}>Title</span>
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div>
          <span className={label}>URL slug</span>
          <Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <span className={label}>Description</span>
          <textarea
            className="min-h-20 w-full rounded-lg border bg-background p-2 text-sm"
            value={f.description ?? ""}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </div>
        <div>
          <span className={label}>Cover image URL</span>
          <Input value={f.coverImageUrl ?? ""} onChange={(e) => setF({ ...f, coverImageUrl: e.target.value })} />
        </div>
        <div>
          <span className={label}>Pass mark (%)</span>
          <Input type="number" value={f.passThreshold} onChange={(e) => setF({ ...f, passThreshold: Number(e.target.value) })} />
        </div>
        <div>
          <span className={label}>Audience</span>
          <select
            className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
            value={f.audience}
            onChange={(e) => setF({ ...f, audience: e.target.value as Course["audience"] })}
          >
            <option value="all">Everyone invited (members, volunteers)</option>
            <option value="volunteer">Volunteers only (hidden from learners)</option>
          </select>
        </div>
        <div>
          <span className={label}>Subsplash status field name</span>
          <div className="flex gap-2">
            <Input
              value={f.subsplashFieldName ?? ""}
              placeholder="e.g. MembershipGroupStatus"
              onChange={(e) => setF({ ...f, subsplashFieldName: e.target.value })}
            />
            <Button variant="outline" onClick={verifyField} disabled={!course.subsplashFieldName}>
              Verify field
            </Button>
          </div>
        </div>
      </div>
      {verify && <p className="text-sm text-muted-foreground">{verify}</p>}
      <p className="text-xs text-muted-foreground">
        The field needs the choices “In Progress” and “Completed”. Save before verifying.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />
        Published (visible to learners)
      </label>
      <Button onClick={save}>Save course</Button>
    </section>
  );
}

type QDraft = { prompt: string; kind: "single" | "multi" | "true_false"; options: { id: string; text: string }[]; correctOptionIds: string[] };

function LessonEditor({
  lesson,
  index,
  count,
  onChanged,
  onMove,
  registerSave,
}: {
  lesson: AdminLesson;
  index: number;
  count: number;
  onChanged: () => void;
  onMove: (dir: -1 | 1) => void;
  // Lets the parent's "Save all changes" call this lesson's save. Resolves
  // true on success (or when there's nothing wrong to report), false on failure.
  registerSave: (id: string, save: (() => Promise<boolean>) | null) => void;
}) {
  const [f, setF] = useState({
    title: lesson.title,
    video: lesson.youtubeVideoId,
    description: lesson.description ?? "",
    minWatchPct: lesson.minWatchPct,
    published: lesson.published,
  });
  const [qs, setQs] = useState<QDraft[]>(
    lesson.questions.map((q) => ({ prompt: q.prompt, kind: q.kind, options: q.options, correctOptionIds: q.correctOptionIds }))
  );
  const [open, setOpen] = useState(false);
  const videoId = extractYoutubeVideoId(f.video);

  // silent = called from "Save all changes", which reports one summary toast.
  async function save(silent = false): Promise<boolean> {
    if (!videoId) {
      toast.error(`Lesson ${index + 1}: enter a valid YouTube link or video id`);
      setOpen(true);
      return false;
    }
    try {
      await sendJson(`/api/admin/training/lessons/${lesson.id}`, "PATCH", {
        title: f.title,
        youtubeVideoId: f.video,
        description: f.description,
        minWatchPct: f.minWatchPct,
        published: f.published,
        questions: qs,
      });
      if (!silent) {
        toast.success("Lesson saved");
        onChanged();
      }
      return true;
    } catch (err) {
      toast.error(`Lesson ${index + 1}: ${err instanceof Error ? err.message : "could not save"}`);
      setOpen(true);
      return false;
    }
  }

  // Always register the latest closure so the parent saves current edits.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    registerSave(lesson.id, () => saveRef.current(true));
    return () => registerSave(lesson.id, null);
  }, [lesson.id, registerSave]);

  async function remove() {
    if (!confirm(`Delete lesson "${lesson.title}" and its quiz?`)) return;
    await sendJson(`/api/admin/training/lessons/${lesson.id}`, "DELETE");
    onChanged();
  }

  function updateQ(i: number, patch: Partial<QDraft>) {
    setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }

  function addQuestion(kind: QDraft["kind"]) {
    const options =
      kind === "true_false"
        ? [{ id: "a", text: "True" }, { id: "b", text: "False" }]
        : [{ id: "a", text: "" }, { id: "b", text: "" }];
    setQs([...qs, { prompt: "", kind, options, correctOptionIds: ["a"] }]);
  }

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex items-center gap-2 px-4 py-3">
        <button className="flex-1 text-left font-medium" onClick={() => setOpen(!open)}>
          {index + 1}. {lesson.title} {!lesson.published && <span className="text-xs text-muted-foreground">(draft)</span>}
        </button>
        <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down">
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={remove} aria-label="Delete lesson">
          <Trash2 />
        </Button>
      </div>
      {open && (
        <div className="space-y-4 border-t p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Title</span>
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </div>
            <div>
              <span className={label}>YouTube link or video id</span>
              <Input value={f.video} onChange={(e) => setF({ ...f, video: e.target.value })} />
              {!videoId && f.video && <p className="mt-1 text-xs text-red-700">Not a recognizable YouTube link</p>}
            </div>
            <div>
              <span className={label}>Watch at least (%)</span>
              <Input type="number" value={f.minWatchPct} onChange={(e) => setF({ ...f, minWatchPct: Number(e.target.value) })} />
            </div>
            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />
              Published
            </label>
          </div>
          {videoId && (
            <div className="aspect-video max-w-md overflow-hidden rounded-lg bg-black">
              <iframe className="h-full w-full" src={`https://www.youtube.com/embed/${videoId}`} title="Preview" allowFullScreen />
            </div>
          )}
          <div>
            <span className={label}>Description (HTML allowed)</span>
            <textarea
              className="min-h-24 w-full rounded-lg border bg-background p-2 text-sm"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Quiz questions</h3>
            {qs.map((q, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex gap-2">
                  <Input value={q.prompt} placeholder="Question" onChange={(e) => updateQ(i, { prompt: e.target.value })} />
                  <Button variant="ghost" size="icon-sm" onClick={() => setQs(qs.filter((_, j) => j !== i))} aria-label="Remove question">
                    <Trash2 />
                  </Button>
                </div>
                {q.options.map((o, oi) => {
                  const correct = q.correctOptionIds.includes(o.id);
                  return (
                    <div key={o.id} className="flex items-center gap-2">
                      <input
                        type={q.kind === "multi" ? "checkbox" : "radio"}
                        name={`q${i}-${lesson.id}`}
                        checked={correct}
                        aria-label="Correct answer"
                        onChange={() =>
                          updateQ(i, {
                            correctOptionIds:
                              q.kind === "multi"
                                ? correct
                                  ? q.correctOptionIds.filter((x) => x !== o.id)
                                  : [...q.correctOptionIds, o.id]
                                : [o.id],
                          })
                        }
                      />
                      <Input
                        value={o.text}
                        readOnly={q.kind === "true_false"}
                        placeholder={`Option ${oi + 1}`}
                        onChange={(e) =>
                          updateQ(i, { options: q.options.map((x, k) => (k === oi ? { ...x, text: e.target.value } : x)) })
                        }
                      />
                    </div>
                  );
                })}
                {q.kind !== "true_false" && q.options.length < 8 && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      updateQ(i, { options: [...q.options, { id: String.fromCharCode(97 + q.options.length), text: "" }] })
                    }
                  >
                    + Add option
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">Mark the correct answer{q.kind === "multi" ? "s" : ""}.</p>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => addQuestion("single")}>
                + Multiple choice
              </Button>
              <Button variant="outline" size="sm" onClick={() => addQuestion("multi")}>
                + Select all
              </Button>
              <Button variant="outline" size="sm" onClick={() => addQuestion("true_false")}>
                + True / False
              </Button>
            </div>
          </div>
          <Button onClick={() => save()}>Save lesson</Button>
        </div>
      )}
    </div>
  );
}

function Roster({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const { data, mutate } = useRoster(courseId);
  const [inviteOpen, setInviteOpen] = useState(false);
  async function resync() {
    const r = await sendJson(`/api/admin/training/courses/${courseId}/resync`, "POST");
    toast.success(`Retried ${r.attempted}, ${r.failed} still failing`);
    mutate();
  }
  async function remove(profileId: string) {
    if (!confirm("Remove this person from the course?")) return;
    const r = await sendJson(`/api/admin/training/courses/${courseId}/roster?profileId=${profileId}`, "DELETE");
    if (r.note) toast.message(r.note);
    mutate();
  }
  return (
    <section className="space-y-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">Roster</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus /> Invite people
          </Button>
          <Button variant="outline" size="sm" onClick={resync}>
            Retry Subsplash sync
          </Button>
        </div>
      </div>
      <InvitePeopleDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        courseId={courseId}
        courseTitle={courseTitle}
        onInvited={() => mutate()}
      />
      {data?.roster.length === 0 && (
        <p className="text-sm text-muted-foreground">No one enrolled yet. Use “Invite people” to add someone.</p>
      )}
      <ul className="divide-y text-sm">
        {data?.roster.map((r) => (
          <li key={r.profileId} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="font-medium">{r.displayName}</div>
              <div className="truncate text-xs text-muted-foreground">{r.email}</div>
            </div>
            <div className="flex items-center gap-3">
              {!r.subsplashSynced && (
                <span className="text-xs text-amber-700" title={r.subsplashSyncError ?? "Pending"}>
                  Subsplash pending
                </span>
              )}
              <span className="text-xs capitalize">{r.status.replace("_", " ")}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => remove(r.profileId)} aria-label="Remove">
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AdminCourseEditor({ id }: { id: string }) {
  const { data, mutate } = useAdminCourse(id);
  const router = useRouter();
  const savers = useRef(new Map<string, () => Promise<boolean>>());
  const [savingAll, setSavingAll] = useState(false);
  // Stable so each lesson's registration effect doesn't re-run every render.
  const registerSave = useRef((lessonId: string, fn: (() => Promise<boolean>) | null) => {
    if (fn) savers.current.set(lessonId, fn);
    else savers.current.delete(lessonId);
  }).current;

  async function saveAll() {
    setSavingAll(true);
    try {
      const results = await Promise.all(Array.from(savers.current.values()).map((fn) => fn()));
      const failed = results.filter((ok) => !ok).length;
      if (failed === 0) toast.success(`Saved ${results.length} ${results.length === 1 ? "lesson" : "lessons"}`);
      else toast.error(`${failed} of ${results.length} lessons could not be saved`);
      await mutate();
    } finally {
      setSavingAll(false);
    }
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { course, lessons } = data;

  async function addLesson() {
    await sendJson(`/api/admin/training/courses/${id}/lessons`, "POST", {
      title: `Lesson ${lessons.length + 1}`,
      youtubeVideoId: "dQw4w9WgXcQ",
      sortOrder: lessons.length,
    });
    mutate();
  }

  async function move(index: number, dir: -1 | 1) {
    const a = lessons[index];
    const b = lessons[index + dir];
    // Re-number the whole list so ties/gaps can't leave two lessons swapped wrongly.
    const order = lessons.map((l) => l.id);
    order[index] = b.id;
    order[index + dir] = a.id;
    await Promise.all(order.map((lid, i) => sendJson(`/api/admin/training/lessons/${lid}`, "PATCH", { sortOrder: i })));
    mutate();
  }

  async function removeCourse() {
    if (!confirm(`Delete "${course.title}" and all progress?`)) return;
    await sendJson(`/api/admin/training/courses/${id}`, "DELETE");
    router.push("/settings/training");
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/settings/training" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All courses
      </Link>
      <h1 className="font-heading text-[22px] font-semibold text-brand-navy">{course.title}</h1>
      <CourseSettings course={course} onSaved={mutate} />
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Lessons</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addLesson}>
              <Plus /> Add lesson
            </Button>
            <Button size="sm" onClick={saveAll} disabled={savingAll || lessons.length === 0}>
              {savingAll ? "Saving…" : "Save all changes"}
            </Button>
          </div>
        </div>
        {lessons.map((l, i) => (
          <LessonEditor
            key={l.id}
            lesson={l}
            index={i}
            count={lessons.length}
            onChanged={mutate}
            onMove={(d) => move(i, d)}
            registerSave={registerSave}
          />
        ))}
        {lessons.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addLesson}>
              <Plus /> Add lesson
            </Button>
            <Button size="sm" onClick={saveAll} disabled={savingAll}>
              {savingAll ? "Saving…" : "Save all changes"}
            </Button>
          </div>
        )}
      </section>
      <Roster courseId={id} courseTitle={course.title} />
      <Button variant="destructive" onClick={removeCourse}>
        Delete course
      </Button>
    </div>
  );
}
