import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("./email", () => ({
  sendBulkEmail: vi.fn(async () => ({ batches: 1 })),
  sendEmail: vi.fn(async () => {}),
  sendEmailBatch: vi.fn(async () => ({ failed: [] })),
  getFromAddress: () => "info@example.org",
}));

import { sendEmailBatch } from "./email";
import { getProfile } from "./subsplash";
import {
  createCourse,
  createLesson,
  getRoster,
  inviteToTraining,
  recordWatch,
  removeEnrollment,
  updateCourse,
} from "./training";
import { runScheduledReminders, sendCourseReminders } from "./trainingReminders";
import { GET as cronGET } from "@/app/api/cron/training-reminders/route";

const batch = sendEmailBatch as unknown as ReturnType<typeof vi.fn>;
const APP = "https://app.test";
const DANIEL = "profile-daniel-okafor";
const MARGARET = "profile-margaret-whitfield";
const PRIYA = "profile-priya-anand";
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const opts = (extra: object = {}) => ({ fromName: "Admin", replyTo: "admin@x.org", appUrl: APP, ...extra });
const sentTo = (call = -1) => (batch.mock.calls.at(call)![0] as { to: string }[]).map((m) => m.to).sort();

async function seed(frequency: "off" | "weekly" = "weekly") {
  const course = await createCourse({
    slug: "membership", title: "Membership", description: null, coverImageUrl: null, audience: "all",
    published: true, sortOrder: 0, subsplashFieldName: null, passThreshold: 80, reminderFrequency: frequency,
  });
  const lesson = await createLesson(course.id, {
    sortOrder: 0, title: "Intro", type: "reading", description: "<p>Hi</p>", youtubeVideoId: null,
    minWatchPct: 90, handoutUrl: null, published: true,
  });
  const people = [];
  for (const id of [DANIEL, MARGARET, PRIYA]) {
    const p = (await getProfile(id))!;
    people.push({ id: p.id, email: p.email, first_name: p.first_name, last_name: p.last_name, directory_access: p.directory_access, directory_role: p.directory_role });
  }
  await inviteToTraining({ people, courseIds: [course.id], invitedBy: "a", sendEmail: false, fromName: "A", replyTo: "a@x.org", appUrl: APP });
  return { course, lesson };
}

beforeEach(() => {
  globalThis.__trainingStore = undefined;
  batch.mockClear();
  batch.mockImplementation(async () => ({ failed: [] }));
});

describe("sendCourseReminders", () => {
  it("emails only unfinished, still-enrolled people once their interval has passed", async () => {
    const { course, lesson } = await seed();
    // Margaret finishes the course (one lesson, no quiz); Priya is removed.
    const margaret = (await getProfile(MARGARET))!;
    await recordWatch({ role: "volunteer", profileId: MARGARET, email: margaret.email!, name: "Margaret Whitfield" }, lesson.id, 100);
    await removeEnrollment(PRIYA, course.id);

    expect(await sendCourseReminders(course.id, { mode: "due", now: inDays(3), ...opts() })).toEqual({ sent: 0, failed: 0, errors: [] });
    expect(batch).not.toHaveBeenCalled();

    const r = await sendCourseReminders(course.id, { mode: "due", now: inDays(8), ...opts() });
    expect(r).toEqual({ sent: 1, failed: 0, errors: [] });
    expect(sentTo()).toEqual(["d.okafor@gracechapel.org"]);
    const msg = batch.mock.calls[0][0][0] as { to: string; subject: string; html: string };
    expect(msg.html).toContain(`${APP}/training/membership`);
    expect(msg.html).toContain("Hi Daniel");
    expect(msg.subject).toBe("Reminder: start Membership");

    // The clock restarted, so a second run the same day sends nothing.
    batch.mockClear();
    expect((await sendCourseReminders(course.id, { mode: "due", now: inDays(8), ...opts() })).sent).toBe(0);
    expect((await sendCourseReminders(course.id, { mode: "due", now: inDays(16), ...opts() })).sent).toBe(1);
  });

  it("pushes to one person now and records it on the roster", async () => {
    const { course } = await seed();
    const r = await sendCourseReminders(course.id, { mode: "now", profileId: PRIYA, ...opts() });
    expect(r.sent).toBe(1);
    expect(sentTo()).toEqual(["priya.anand@gmail.com"]);
    expect(batch.mock.calls[0][1]).toEqual({ fromName: "Admin", replyTo: "admin@x.org" });
    const roster = await getRoster(course.id);
    expect(roster.find((x) => x.profileId === PRIYA)!.lastRemindedAt).toBeInstanceOf(Date);
    expect(roster.find((x) => x.profileId === DANIEL)!.lastRemindedAt).toBeNull();
  });

  it("pushes to everyone unfinished, regardless of the schedule", async () => {
    const { course } = await seed("off");
    expect((await sendCourseReminders(course.id, { mode: "due", now: inDays(400), ...opts() })).sent).toBe(0);
    expect((await sendCourseReminders(course.id, { mode: "now", ...opts() })).sent).toBe(3);
  });

  it("refuses an unpublished course and a person who can't be reminded", async () => {
    const { course } = await seed();
    await expect(sendCourseReminders(course.id, { mode: "now", profileId: "nobody", ...opts() })).rejects.toMatchObject({ status: 400 });
    await updateCourse(course.id, { published: false });
    await expect(sendCourseReminders(course.id, { mode: "now", ...opts() })).rejects.toMatchObject({ status: 400 });
  });

  it("doesn't restart the clock for a send that failed", async () => {
    const { course } = await seed();
    batch.mockImplementationOnce(async (messages: { to: string }[]) => ({
      failed: [{ index: messages.findIndex((m) => m.to === "priya.anand@gmail.com"), message: "bounced" }],
    }));
    const r = await sendCourseReminders(course.id, { mode: "now", ...opts() });
    expect(r).toMatchObject({ sent: 2, failed: 1 });
    expect(r.errors[0]).toMatch(/Priya.*bounced/);
    const roster = await getRoster(course.id);
    expect(roster.find((x) => x.profileId === PRIYA)!.lastRemindedAt).toBeNull();
    expect(roster.find((x) => x.profileId === DANIEL)!.lastRemindedAt).toBeInstanceOf(Date);
  });
});

describe("runScheduledReminders and its cron route", () => {
  it("only runs courses that are published with reminders on", async () => {
    await seed("off");
    expect(await runScheduledReminders(APP, inDays(30))).toMatchObject({ courses: 0, sent: 0 });
    globalThis.__trainingStore = undefined;
    await seed("weekly");
    expect(await runScheduledReminders(APP, inDays(8))).toMatchObject({ courses: 1, sent: 3 });
    expect(batch.mock.calls.at(-1)![1]).toEqual({ fromName: "STSA Church", replyTo: "info@example.org" });
  });

  it("rejects a cron call without the secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await cronGET(new NextRequest("http://localhost/api/cron/training-reminders"));
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });
});
