import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory store + mock Subsplash (no DATABASE_URL, SUBSPLASH_USE_MOCK default).
vi.mock("./email", () => ({
  sendBulkEmail: vi.fn(async () => ({ batches: 1 })),
  getFromAddress: () => "from@example.org",
}));

import { sendBulkEmail } from "./email";
import { getProfile, getProfileIdByEmail, getDirectoryRole, hasDirectoryAccess } from "./subsplash";
import { mockProfiles } from "./mockData";
import {
  canAccessCourse,
  createCourse,
  createLesson,
  getCourseView,
  getRoster,
  inviteToTraining,
  listCoursesForViewer,
  markContentRead,
  recordWatch,
  replaceQuestions,
  resetProgress,
  submitQuiz,
  syncCourseStatus,
  updateCourse,
} from "./training";

const FIELD = "MembershipGroupStatus";

async function seed() {
  const course = await createCourse({
    slug: "membership-group",
    title: "Membership Group",
    description: null,
    coverImageUrl: null,
    audience: "all",
    published: true,
    sortOrder: 0,
    subsplashFieldName: FIELD,
    passThreshold: 80,
  });
  const l1 = await createLesson(course.id, {
    sortOrder: 0, title: "Gospel", type: "video", description: null, youtubeVideoId: "dQw4w9WgXcQ", minWatchPct: 90, handoutUrl: null, published: true,
  });
  const l2 = await createLesson(course.id, {
    sortOrder: 1, title: "God", type: "video", description: null, youtubeVideoId: "dQw4w9WgXcQ", minWatchPct: 90, handoutUrl: null, published: true,
  });
  await replaceQuestions(l1.id, [
    { prompt: "Q1", kind: "single", options: [{ id: "a", text: "x" }, { id: "b", text: "y" }], correctOptionIds: ["a"] },
  ]);
  return { course, l1, l2 };
}

// Daniel has no DirectoryAccess / DirectoryRole in the mock data.
const learner = { role: "learner", profileId: "profile-daniel-okafor", email: "d.okafor@gracechapel.org", name: "Daniel Okafor" };
const fieldValue = async () =>
  (await getProfile("profile-daniel-okafor"))?.custom_fields?.find((f) => f.label === FIELD)?.value;

beforeEach(() => {
  globalThis.__trainingStore = undefined;
});

describe("training flow (mock mode)", () => {
  it("invites a no-access person as Learner, emails them, and scopes courses by enrollment", async () => {
    const { course } = await seed();
    expect((await listCoursesForViewer(learner)).length).toBe(0);

    const daniel = (await getProfile("profile-daniel-okafor"))!;
    expect(daniel.directory_access).toBeFalsy();
    expect(daniel.directory_role).toBeUndefined();
    const r = await inviteToTraining({
      people: [{ id: daniel.id, email: daniel.email, first_name: daniel.first_name, last_name: daniel.last_name, directory_access: daniel.directory_access, directory_role: daniel.directory_role }],
      courseIds: [course.id], invitedBy: "admin@x.org", sendEmail: true, fromName: "Admin", replyTo: "admin@x.org", appUrl: "https://app.test",
    });
    expect(r.results[0]).toMatchObject({ status: "invited" });
    expect(r.emailed).toBe(1);
    expect(sendBulkEmail).toHaveBeenCalledOnce();
    expect(r.results[0].roleSet).toBe(true);
    expect((await getProfile("profile-daniel-okafor"))?.directory_role).toBe("Learner");
    expect((await listCoursesForViewer(learner)).map((c) => c.course.id)).toEqual([course.id]);
    expect((await getRoster(course.id))[0]).toMatchObject({ status: "invited" });
  });

  it("enrolls by profile id even with no email, and emails a shared address once", async () => {
    const { course } = await seed();
    (sendBulkEmail as unknown as ReturnType<typeof vi.fn>).mockClear();
    const person = (id: string, first: string, email?: string) => ({ id, email, first_name: first, last_name: "Test", directory_access: true });
    const r = await inviteToTraining({
      people: [person("p-noemail", "NoEmail"), person("p-parent", "Parent", "Family@x.org"), person("p-child", "Child", "family@x.org")],
      courseIds: [course.id], invitedBy: "a", sendEmail: true, fromName: "A", replyTo: "a@x.org", appUrl: "https://app.test",
    });
    expect(r.results.map((x) => x.status)).toEqual(["invited", "invited", "invited"]);
    expect(r.results[0].reason).toMatch(/No email/);
    expect(r.emailed).toBe(1);
    expect((sendBulkEmail as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].bcc.map((e: string) => e.toLowerCase())).toEqual(["family@x.org"]);
    expect((await getRoster(course.id)).map((x) => x.profileId).sort()).toEqual(["p-child", "p-noemail", "p-parent"]);
  });

  it("does not downgrade someone who already has access", async () => {
    const { course } = await seed();
    const margaret = (await getProfile("profile-margaret-whitfield"))!; // DirectoryAccess=Yes
    const r = await inviteToTraining({
      people: [{ id: margaret.id, email: margaret.email, first_name: margaret.first_name, last_name: margaret.last_name, directory_access: true }],
      courseIds: [course.id], invitedBy: "a", sendEmail: false, fromName: "A", replyTo: "a@x.org", appUrl: "https://app.test",
    });
    expect(r.results[0].roleSet).toBe(false);
    expect((await getProfile("profile-margaret-whitfield"))?.directory_role).not.toBe("Learner");
  });

  it("walks a learner through watch → quiz → completion and syncs the Subsplash field", async () => {
    const { course, l1, l2 } = await seed();
    const daniel = (await getProfile("profile-daniel-okafor"))!;
    await inviteToTraining({
      people: [{ id: daniel.id, email: daniel.email, first_name: "Priya", last_name: "Anand", directory_access: daniel.directory_access }],
      courseIds: [course.id], invitedBy: "a", sendEmail: false, fromName: "A", replyTo: "a@x.org", appUrl: "https://app.test",
    });

    // Lesson 2 is locked until lesson 1 is complete.
    await expect(recordWatch(learner, l2.id, 100)).rejects.toMatchObject({ status: 403 });
    // Quiz can't be graded before the video is watched.
    await expect(submitQuiz(learner, l1.id, { nope: ["a"] })).rejects.toMatchObject({ status: 403 });

    // Watching/grading return without touching Subsplash; the client then
    // calls the sync endpoint (syncCourseStatus) when told needsSync.
    const first = await recordWatch(learner, l1.id, 40);
    expect(first.needsSync).toBe(true);
    expect(await fieldValue()).toBeUndefined();
    await syncCourseStatus(learner, l1.id);
    expect(await fieldValue()).toBe("In Progress");
    await recordWatch(learner, l1.id, 95);

    let view = await getCourseView(learner, course.slug);
    expect(view!.lessons[0].contentComplete).toBe(true);
    expect(view!.lessons[1].locked).toBe(true); // quiz not passed yet
    // Answer keys never leave the server.
    expect(JSON.stringify(view)).not.toContain("correctOptionIds");

    const qid = view!.lessons[0].questions[0].id;
    expect((await submitQuiz(learner, l1.id, { [qid]: ["b"] })).passed).toBe(false);
    const graded = await submitQuiz(learner, l1.id, { [qid]: ["a"] });
    expect(graded.passed).toBe(true);
    expect(graded.needsSync).toBe(false); // still "In Progress", already synced

    view = await getCourseView(learner, course.slug);
    expect(view!.lessons[1].locked).toBe(false);
    expect(view!.status).toBe("in_progress");

    expect((await recordWatch(learner, l2.id, 100)).needsSync).toBe(true); // no quiz → complete on video
    expect(await fieldValue()).toBe("In Progress");
    expect(await syncCourseStatus(learner, l2.id)).toMatchObject({ synced: true });
    view = await getCourseView(learner, course.slug);
    expect(view!.status).toBe("completed");
    expect(await fieldValue()).toBe("Completed");
    expect((await getRoster(course.id))[0]).toMatchObject({ status: "completed", subsplashSynced: true });
  });

  it("walks a learner through a reading lesson via markContentRead", async () => {
    const course = await createCourse({
      slug: "reading-course", title: "Reading Course", description: null, coverImageUrl: null,
      audience: "all", published: true, sortOrder: 0, subsplashFieldName: FIELD, passThreshold: 80,
    });
    const video = await createLesson(course.id, {
      sortOrder: 0, title: "Intro video", type: "video", description: null, youtubeVideoId: "dQw4w9WgXcQ", minWatchPct: 90, handoutUrl: null, published: true,
    });
    const reading = await createLesson(course.id, {
      sortOrder: 1, title: "A Reading", type: "reading", description: "<p>Read this.</p>", youtubeVideoId: null, minWatchPct: 90, handoutUrl: "https://example.org/handout.pdf", published: true,
    });
    const daniel = (await getProfile("profile-daniel-okafor"))!;
    await inviteToTraining({
      people: [{ id: daniel.id, email: daniel.email, first_name: "Priya", last_name: "Anand", directory_access: daniel.directory_access }],
      courseIds: [course.id], invitedBy: "a", sendEmail: false, fromName: "A", replyTo: "a@x.org", appUrl: "https://app.test",
    });

    // markContentRead only applies to reading lessons.
    await expect(markContentRead(learner, video.id)).rejects.toMatchObject({ status: 400 });
    // The reading lesson is locked until the video lesson is complete.
    await expect(markContentRead(learner, reading.id)).rejects.toMatchObject({ status: 403 });

    await recordWatch(learner, video.id, 95);
    const result = await markContentRead(learner, reading.id);
    expect(result.needsSync).toBe(true);

    const view = await getCourseView(learner, course.slug);
    const readingView = view!.lessons.find((l) => l.lesson.id === reading.id)!;
    expect(readingView.contentComplete).toBe(true);
    expect(readingView.complete).toBe(true); // no quiz on this lesson → complete outright
    expect(readingView.lesson.handoutUrl).toBe("https://example.org/handout.pdf");
    expect(view!.status).toBe("completed");
  });

  it("resets one person's progress so they can retake the course", async () => {
    const { course, l1, l2 } = await seed();
    const d = (await getProfile("profile-daniel-okafor"))!;
    await inviteToTraining({
      people: [{ id: d.id, email: d.email, first_name: "Daniel", last_name: "Okafor", directory_access: d.directory_access }],
      courseIds: [course.id], invitedBy: "a", sendEmail: false, fromName: "A", replyTo: "a@x.org", appUrl: "https://app.test",
    });
    await recordWatch(learner, l1.id, 95);
    const qid = (await getCourseView(learner, course.slug))!.lessons[0].questions[0].id;
    await submitQuiz(learner, l1.id, { [qid]: ["a"] });
    await recordWatch(learner, l2.id, 100);
    expect((await getCourseView(learner, course.slug))!.status).toBe("completed");

    const reset = await resetProgress(course.id, d.id);
    expect(reset).toEqual({ subsplashUpdated: true });
    expect(await fieldValue()).toBe("Not Started");
    const view = (await getCourseView(learner, course.slug))!;
    expect(view.status).toBe("not_started");
    expect(view.lessons.map((l) => [l.complete, l.locked, l.watchedPct])).toEqual([[false, false, 0], [false, true, 0]]);
    // Still enrolled, and can start over.
    expect((await listCoursesForViewer(learner)).map((c) => c.course.id)).toEqual([course.id]);
    await recordWatch(learner, l1.id, 50);
    expect((await getCourseView(learner, course.slug))!.status).toBe("in_progress");
  });

  it("restricts an invite_only course to admins and whoever is enrolled, regardless of role", async () => {
    const { course } = await seed();
    await updateCourse(course.id, { audience: "invite_only" });
    const daniel = (await getProfile("profile-daniel-okafor"))!;
    const staff = { role: "staff", profileId: "profile-staff-x" };
    const volunteer = { role: "volunteer", profileId: "profile-volunteer-x" };
    const admin = { role: "admin", profileId: "profile-admin-x" };

    // Not enrolled: even staff/volunteer are turned away.
    expect(await canAccessCourse(staff, course)).toBe(false);
    expect(await canAccessCourse(volunteer, course)).toBe(false);
    expect(await canAccessCourse(learner, course)).toBe(false);
    // Admins always manage every course.
    expect(await canAccessCourse(admin, course)).toBe(true);

    await inviteToTraining({
      people: [{ id: daniel.id, email: daniel.email, first_name: "P", last_name: "A", directory_access: daniel.directory_access }],
      courseIds: [course.id], invitedBy: "a", sendEmail: false, fromName: "A", replyTo: "a@x.org", appUrl: "https://app.test",
    });
    expect(await canAccessCourse(learner, course)).toBe(true);
  });

  it("hides volunteer-only and unpublished courses from learners", async () => {
    const { course } = await seed();
    const daniel = (await getProfile("profile-daniel-okafor"))!;
    await inviteToTraining({
      people: [{ id: daniel.id, email: daniel.email, first_name: "P", last_name: "A", directory_access: daniel.directory_access }],
      courseIds: [course.id], invitedBy: "a", sendEmail: false, fromName: "A", replyTo: "a@x.org", appUrl: "https://app.test",
    });
    await updateCourse(course.id, { audience: "volunteer" });
    expect(await getCourseView(learner, course.slug)).toBeNull();
    await updateCourse(course.id, { audience: "all", published: false });
    expect(await getCourseView(learner, course.slug)).toBeNull();
    expect(await getCourseView({ role: "admin", profileId: "x" }, course.slug)).not.toBeNull();
  });
});

describe("profile lookups match on name as well as email", () => {
  it("does not confuse a child who shares a parent's email", async () => {
    const parent = (await getProfile("profile-margaret-whitfield"))!; // DirectoryAccess=Yes
    const child = { ...parent, id: "profile-test-child", first_name: "Tiny", last_name: "Whitfield", custom_fields: [], directory_access: false };
    mockProfiles.push(child);
    try {
      const email = parent.email;
      expect(await getProfileIdByEmail(email, "Margaret Whitfield")).toBe(parent.id);
      expect(await getProfileIdByEmail(email, "Tiny Whitfield")).toBe(child.id);
      expect(await getProfileIdByEmail(email, "Someone Else")).toBeUndefined();
      // Access/role belong to the matching person only.
      expect(await hasDirectoryAccess(email, "Margaret Whitfield")).toBe(true);
      expect(await hasDirectoryAccess(email, "Tiny Whitfield")).toBe(false);
      expect(await getDirectoryRole(email, "Tiny Whitfield")).toBeUndefined();
    } finally {
      mockProfiles.splice(mockProfiles.indexOf(child), 1);
    }
  });
});
