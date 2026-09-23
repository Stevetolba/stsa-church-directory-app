import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory store + mock Subsplash (no DATABASE_URL, SUBSPLASH_USE_MOCK default).
vi.mock("./email", () => ({
  sendBulkEmail: vi.fn(async () => ({ batches: 1 })),
  getFromAddress: () => "from@example.org",
}));

import { sendBulkEmail } from "./email";
import { getProfile } from "./subsplash";
import {
  createCourse,
  createLesson,
  getCourseView,
  getRoster,
  inviteToTraining,
  listCoursesForViewer,
  recordWatch,
  replaceQuestions,
  submitQuiz,
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
    sortOrder: 0, title: "Gospel", description: null, youtubeVideoId: "dQw4w9WgXcQ", minWatchPct: 90, published: true,
  });
  const l2 = await createLesson(course.id, {
    sortOrder: 1, title: "God", description: null, youtubeVideoId: "dQw4w9WgXcQ", minWatchPct: 90, published: true,
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

    await recordWatch(learner, l1.id, 40);
    expect(await fieldValue()).toBe("In Progress");
    await recordWatch(learner, l1.id, 95);

    let view = await getCourseView(learner, course.slug);
    expect(view!.lessons[0].videoComplete).toBe(true);
    expect(view!.lessons[1].locked).toBe(true); // quiz not passed yet
    // Answer keys never leave the server.
    expect(JSON.stringify(view)).not.toContain("correctOptionIds");

    const qid = view!.lessons[0].questions[0].id;
    expect((await submitQuiz(learner, l1.id, { [qid]: ["b"] })).passed).toBe(false);
    expect((await submitQuiz(learner, l1.id, { [qid]: ["a"] })).passed).toBe(true);

    view = await getCourseView(learner, course.slug);
    expect(view!.lessons[1].locked).toBe(false);
    expect(view!.status).toBe("in_progress");

    await recordWatch(learner, l2.id, 100); // no quiz → complete on video
    view = await getCourseView(learner, course.slug);
    expect(view!.status).toBe("completed");
    expect(await fieldValue()).toBe("Completed");
    expect((await getRoster(course.id))[0]).toMatchObject({ status: "completed", subsplashSynced: true });
  });

  it("hides volunteer-only and unpublished courses from learners", async () => {
    const { course } = await seed();
    const daniel = (await getProfile("profile-daniel-okafor"))!;
    await inviteToTraining({
      people: [{ id: daniel.id, email: daniel.email, first_name: "P", last_name: "A", directory_access: daniel.directory_access }],
      courseIds: [course.id], invitedBy: "a", sendEmail: false, fromName: "A", replyTo: "a@x.org", appUrl: "https://app.test",
    });
    const { updateCourse } = await import("./training");
    await updateCourse(course.id, { audience: "volunteer" });
    expect(await getCourseView(learner, course.slug)).toBeNull();
    await updateCourse(course.id, { audience: "all", published: false });
    expect(await getCourseView(learner, course.slug)).toBeNull();
    expect(await getCourseView({ role: "admin", profileId: "x" }, course.slug)).not.toBeNull();
  });
});
