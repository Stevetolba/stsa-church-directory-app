import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./email", () => ({
  sendBulkEmail: vi.fn(async () => ({ batches: 1 })),
  sendEmail: vi.fn(async () => {}),
  getFromAddress: () => "from@example.org",
}));

import { sendEmail } from "./email";
import { getProfile } from "./subsplash";
import { mockProfiles } from "./mockData";
import { createCourse, inviteToTraining } from "./training";
import {
  MAX_CODES_PER_HOUR,
  MAX_WRONG_GUESSES,
  checkHouseholdLoginCode,
  checkLoginCode,
  consumeHouseholdLoginCode,
  consumeLoginCode,
  requestHouseholdLoginCode,
  requestLoginCode,
} from "./loginCode";

const sent = sendEmail as unknown as ReturnType<typeof vi.fn>;
const opts = { logoUrl: "https://app.test/stsa-logo.png" };
const EMAIL = "d.okafor@gracechapel.org"; // Daniel: no DirectoryAccess/DirectoryRole in mock data
const DANIEL = "profile-daniel-okafor";

async function invite(profileIds: string[]) {
  const course = await createCourse({
    slug: `c-${Math.random().toString(36).slice(2)}`, title: "C", description: null, coverImageUrl: null,
    audience: "all", published: true, sortOrder: 0, subsplashFieldName: null, passThreshold: 80, reminderFrequency: "off",
  });
  const people = [];
  for (const id of profileIds) {
    const p = (await getProfile(id))!;
    people.push({ id: p.id, email: p.email, first_name: p.first_name, last_name: p.last_name, directory_access: p.directory_access, directory_role: p.directory_role });
  }
  await inviteToTraining({
    people, courseIds: [course.id], invitedBy: "a", sendEmail: false, fromName: "A", replyTo: "a@x.org", appUrl: "https://app.test",
  });
}

const lastCode = () => {
  const html = sent.mock.calls.at(-1)![0].html as string;
  return /letter-spacing:6px[^>]*>(\d{6})</.exec(html)![1];
};

beforeEach(() => {
  globalThis.__trainingStore = undefined;
  globalThis.__loginCodeStore = undefined;
  sent.mockClear();
  // Reset Daniel to "no role" so each test invites from scratch.
  const d = mockProfiles.find((p) => p.id === DANIEL)!;
  d.directory_role = undefined;
  d.custom_fields = d.custom_fields?.filter((f) => f.label !== "DirectoryRole");
});

describe("requestLoginCode", () => {
  it("sends nothing for an unknown email, an uninvited person, or a non-learner", async () => {
    await requestLoginCode("nobody@example.org", opts);
    await requestLoginCode(EMAIL, opts); // exists, but never invited → no Learner role
    await requestLoginCode("margaret.whitfield@gracechapel.org", opts);
    expect(sent).not.toHaveBeenCalled();
  });

  it("emails an invited learner a 6-digit code, to them alone", async () => {
    await invite([DANIEL]);
    await requestLoginCode(` ${EMAIL.toUpperCase()} `, opts);
    expect(sent).toHaveBeenCalledOnce();
    expect(sent.mock.calls[0][0].to).toBe(EMAIL);
    expect(lastCode()).toMatch(/^\d{6}$/);
  });

  it("caps codes per email per hour", async () => {
    await invite([DANIEL]);
    for (let i = 0; i < MAX_CODES_PER_HOUR + 3; i++) await requestLoginCode(EMAIL, opts);
    expect(sent).toHaveBeenCalledTimes(MAX_CODES_PER_HOUR);
  });

  it("invalidates the previous code when a new one is requested", async () => {
    await invite([DANIEL]);
    await requestLoginCode(EMAIL, opts);
    const first = lastCode();
    await requestLoginCode(EMAIL, opts);
    const second = lastCode();
    if (first !== second) expect(await checkLoginCode(EMAIL, first)).toMatchObject({ ok: false });
    expect(await checkLoginCode(EMAIL, second)).toMatchObject({ ok: true });
  });
});

describe("checkLoginCode / consumeLoginCode", () => {
  it("returns the learner for the right code and signs them in exactly once", async () => {
    await invite([DANIEL]);
    await requestLoginCode(EMAIL, opts);
    const code = lastCode();
    const r = await checkLoginCode(EMAIL, code);
    expect(r).toMatchObject({ ok: true, candidates: [{ profileId: DANIEL, name: "Daniel Okafor" }] });
    expect(await consumeLoginCode(EMAIL, code, DANIEL)).toMatchObject({ id: DANIEL, email: EMAIL, name: "Daniel Okafor" });
    expect(await consumeLoginCode(EMAIL, code, DANIEL)).toBeNull(); // one use only
  });

  it("locks after too many wrong guesses, even for the right code", async () => {
    await invite([DANIEL]);
    await requestLoginCode(EMAIL, opts);
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAX_WRONG_GUESSES - 1; i++) {
      expect(await checkLoginCode(EMAIL, wrong)).toEqual({ ok: false, reason: "wrong" });
    }
    expect(await checkLoginCode(EMAIL, wrong)).toEqual({ ok: false, reason: "locked" });
    expect(await checkLoginCode(EMAIL, code)).toEqual({ ok: false, reason: "locked" });
  });

  it("rejects an expired code", async () => {
    await invite([DANIEL]);
    await requestLoginCode(EMAIL, opts);
    const code = lastCode();
    globalThis.__loginCodeStore![0].expiresAt = new Date(Date.now() - 1000);
    expect(await checkLoginCode(EMAIL, code)).toEqual({ ok: false, reason: "expired" });
    expect(await consumeLoginCode(EMAIL, code, DANIEL)).toBeNull();
  });

  it("refuses someone who was removed from every course", async () => {
    await invite([DANIEL]);
    await requestLoginCode(EMAIL, opts);
    const code = lastCode();
    const { removeEnrollment, listEnrollmentsForProfile } = await import("./training");
    for (const e of await listEnrollmentsForProfile(DANIEL)) await removeEnrollment(DANIEL, e.courseId);
    expect(await checkLoginCode(EMAIL, code)).toMatchObject({ ok: false });
    expect(await consumeLoginCode(EMAIL, code, DANIEL)).toBeNull();
  });

  it("lets learners who share an email choose, and refuses a profile that isn't theirs", async () => {
    const child = {
      ...mockProfiles.find((p) => p.id === DANIEL)!,
      id: "profile-test-okafor-kid", first_name: "Tiny", last_name: "Okafor", custom_fields: [],
    };
    mockProfiles.push(child);
    try {
      await invite([DANIEL, child.id]);
      await requestLoginCode(EMAIL, opts);
      const code = lastCode();
      const r = await checkLoginCode(EMAIL, code);
      expect(r.ok && r.candidates.map((c) => c.profileId).sort()).toEqual([DANIEL, child.id].sort());
      expect(await consumeLoginCode(EMAIL, code, "profile-margaret-whitfield")).toBeNull();
      expect(await consumeLoginCode(EMAIL, code, child.id)).toMatchObject({ id: child.id, name: "Tiny Okafor" });
    } finally {
      mockProfiles.splice(mockProfiles.indexOf(child), 1);
    }
  });
});


describe("household sign-in codes", () => {
  const MARGARET = "margaret.whitfield@gracechapel.org"; // parent in household-whitfield
  const LILY = "lily.whitfield@gracechapel.org"; // child: not eligible

  it("emails a code only to a parent or guardian in a household", async () => {
    await requestHouseholdLoginCode("nobody@example.org", opts);
    await requestHouseholdLoginCode(LILY, opts);
    expect(sent).not.toHaveBeenCalled();
    await requestHouseholdLoginCode(MARGARET, opts);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0].subject).toContain("household update code");
  });

  it("signs in the guardian and returns the household from Subsplash", async () => {
    await requestHouseholdLoginCode(MARGARET, opts);
    const code = lastCode();
    const checked = await checkHouseholdLoginCode(MARGARET, code);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.candidates).toHaveLength(1);
    const user = await consumeHouseholdLoginCode(MARGARET, code, checked.candidates[0].profileId);
    expect(user).toMatchObject({ email: MARGARET, householdId: "household-whitfield" });
    // single use
    expect(await consumeHouseholdLoginCode(MARGARET, code, checked.candidates[0].profileId)).toBeNull();
  });

  it("refuses a profile that isn't one of the email's guardians", async () => {
    await requestHouseholdLoginCode(MARGARET, opts);
    expect(await consumeHouseholdLoginCode(MARGARET, lastCode(), "profile-lily-whitfield")).toBeNull();
  });

  it("keeps training and household codes separate", async () => {
    await requestHouseholdLoginCode(MARGARET, opts);
    const code = lastCode();
    // A household code is not a training code...
    expect((await checkLoginCode(MARGARET, code)).ok).toBe(false);
    // ...and a training code is not a household code.
    await invite(["profile-daniel-okafor"]);
    await requestLoginCode(EMAIL, opts);
    const trainingCode = lastCode();
    expect((await checkHouseholdLoginCode(EMAIL, trainingCode)).ok).toBe(false);
  });

  it("rate-limits household codes without touching the training allowance", async () => {
    for (let i = 0; i < MAX_CODES_PER_HOUR + 2; i++) await requestHouseholdLoginCode(MARGARET, opts);
    expect(sent).toHaveBeenCalledTimes(MAX_CODES_PER_HOUR);
  });
});
