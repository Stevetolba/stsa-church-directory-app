// Training reminder emails (ADR-0026): each unfinished enrollee gets a
// personal email with their progress and a link to the course, either on the
// course's schedule (daily cron, mode "due") or when an admin pushes one
// (mode "now"). Uses lib/training.ts for all persistence.

import { getFromAddress, sendEmailBatch } from "./email";
import {
  TrainingError,
  getCourse,
  listCourses,
  listCourseStatuses,
  listEnrollmentsForCourse,
  listLessons,
  listProgressForCourse,
  listQuestions,
  markReminded,
} from "./training";
import { computeLessonStates, isReminderDue } from "./trainingLogic";
import { CHURCH_NAME, buildReminderEmail } from "./trainingEmail";

export interface ReminderResult {
  sent: number;
  failed: number;
  // One entry per failure, with the person's name — shown to the admin.
  errors: string[];
}

export async function sendCourseReminders(
  courseId: string,
  opts: {
    mode: "due" | "now";
    profileId?: string;
    fromName: string;
    replyTo: string;
    appUrl: string;
    now?: Date;
  }
): Promise<ReminderResult> {
  const course = await getCourse(courseId);
  if (!course) throw new TrainingError("Course not found", 404);
  if (!course.published) throw new TrainingError("Publish the course before sending reminders", 400);
  const now = opts.now ?? new Date();

  const [enrollments, statuses, lessons, progress] = await Promise.all([
    listEnrollmentsForCourse(courseId),
    listCourseStatuses(courseId),
    listLessons(courseId, { publishedOnly: true }),
    listProgressForCourse(courseId),
  ]);
  const completed = new Set(statuses.filter((s) => s.status === "completed").map((s) => s.profileId));
  const recipients = enrollments.filter(
    (e) =>
      !completed.has(e.profileId) &&
      !!e.email &&
      (!opts.profileId || e.profileId === opts.profileId) &&
      (opts.mode === "now" ||
        isReminderDue({ frequency: course.reminderFrequency, invitedAt: e.invitedAt, lastRemindedAt: e.lastRemindedAt, now }))
  );
  if (opts.profileId && recipients.length === 0) {
    throw new TrainingError("This person isn't enrolled, has already finished, or has no email address", 400);
  }
  if (recipients.length === 0) return { sent: 0, failed: 0, errors: [] };

  const withQuiz = await Promise.all(
    lessons.map(async (l) => ({ id: l.id, hasQuiz: (await listQuestions(l.id)).length > 0 }))
  );
  const messages = recipients.map((e) => {
    const mine = Object.fromEntries(progress.filter((p) => p.profileId === e.profileId).map((p) => [p.lessonId, p]));
    const completedLessons = computeLessonStates(withQuiz, mine).filter((s) => s.complete).length;
    const { subject, html } = buildReminderEmail({
      firstName: e.displayName.split(/\s+/)[0] || e.displayName,
      courseTitle: course.title,
      completedLessons,
      lessonCount: lessons.length,
      courseUrl: `${opts.appUrl}/training/${course.slug}`,
      logoUrl: `${opts.appUrl}/stsa-logo.png`,
    });
    return { to: e.email, subject, html };
  });

  const { failed } = await sendEmailBatch(messages, { fromName: opts.fromName, replyTo: opts.replyTo });
  const failedIdx = new Set(failed.map((f) => f.index));
  await markReminded(
    courseId,
    recipients.filter((_, i) => !failedIdx.has(i)).map((e) => e.profileId),
    now
  );
  return {
    sent: recipients.length - failedIdx.size,
    failed: failedIdx.size,
    errors: failed.map((f) => `${recipients[f.index].displayName}: ${f.message}`),
  };
}

// Daily cron: every published course with reminders turned on. One course
// failing (e.g. an email outage) doesn't stop the others.
export async function runScheduledReminders(appUrl: string, now = new Date()): Promise<ReminderResult & { courses: number }> {
  const courses = (await listCourses()).filter((c) => c.published && c.reminderFrequency !== "off");
  const total = { courses: courses.length, sent: 0, failed: 0, errors: [] as string[] };
  for (const course of courses) {
    try {
      const r = await sendCourseReminders(course.id, {
        mode: "due",
        fromName: CHURCH_NAME,
        replyTo: getFromAddress(),
        appUrl,
        now,
      });
      total.sent += r.sent;
      total.failed += r.failed;
      total.errors.push(...r.errors.map((e) => `${course.title} — ${e}`));
    } catch (err) {
      total.errors.push(`${course.title}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  return total;
}
