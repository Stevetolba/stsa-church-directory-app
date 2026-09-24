import { describe, expect, it } from "vitest";
import {
  computeCourseStatus,
  computeLessonStates,
  gradeQuiz,
  isAnswerCorrect,
  isLessonComplete,
  lessonSlugs,
} from "./trainingLogic";
import { extractYoutubeVideoId } from "./youtube";

const q1 = { id: "q1", correctOptionIds: ["a"] };
const q2 = { id: "q2", correctOptionIds: ["a", "c"] };

describe("isAnswerCorrect", () => {
  it("requires an exact set match", () => {
    expect(isAnswerCorrect(q1, ["a"])).toBe(true);
    expect(isAnswerCorrect(q1, ["b"])).toBe(false);
    expect(isAnswerCorrect(q2, ["c", "a"])).toBe(true);
    expect(isAnswerCorrect(q2, ["a"])).toBe(false);
    expect(isAnswerCorrect(q2, ["a", "b", "c"])).toBe(false);
    expect(isAnswerCorrect(q1, undefined)).toBe(false);
  });
});

describe("gradeQuiz", () => {
  it("scores and applies the pass threshold", () => {
    const r = gradeQuiz([q1, q2], { q1: ["a"], q2: ["a"] }, 50);
    expect(r.score).toBe(50);
    expect(r.passed).toBe(true);
    expect(r.perQuestion).toEqual({ q1: true, q2: false });
    expect(gradeQuiz([q1, q2], { q1: ["a"], q2: ["a"] }, 80).passed).toBe(false);
  });
  it("passes an empty quiz", () => {
    expect(gradeQuiz([], {}, 80)).toMatchObject({ score: 100, passed: true });
  });
});

const done = { watchedPct: 100, videoCompletedAt: new Date(), quizPassedAt: new Date() };
const videoOnly = { watchedPct: 100, videoCompletedAt: new Date(), quizPassedAt: null };

describe("lesson completion and unlock order", () => {
  it("needs the quiz only when the lesson has one", () => {
    expect(isLessonComplete(videoOnly, true)).toBe(false);
    expect(isLessonComplete(videoOnly, false)).toBe(true);
    expect(isLessonComplete(undefined, false)).toBe(false);
  });
  it("locks lesson N+1 until N is complete", () => {
    const lessons = [
      { id: "l1", hasQuiz: true },
      { id: "l2", hasQuiz: false },
    ];
    expect(computeLessonStates(lessons, {}).map((s) => s.locked)).toEqual([false, true]);
    expect(computeLessonStates(lessons, { l1: videoOnly }).map((s) => s.locked)).toEqual([false, true]);
    expect(computeLessonStates(lessons, { l1: done }).map((s) => s.locked)).toEqual([false, false]);
  });
});

describe("computeCourseStatus", () => {
  const lessons = [
    { id: "l1", hasQuiz: true },
    { id: "l2", hasQuiz: false },
  ];
  it("is null with no activity or no lessons", () => {
    expect(computeCourseStatus(lessons, {})).toBeNull();
    expect(computeCourseStatus([], {})).toBeNull();
  });
  it("is in_progress after partial activity", () => {
    expect(computeCourseStatus(lessons, { l1: { ...videoOnly, watchedPct: 40, videoCompletedAt: null } })).toBe(
      "in_progress"
    );
    expect(computeCourseStatus(lessons, { l1: done })).toBe("in_progress");
  });
  it("is completed when every lesson is complete", () => {
    expect(computeCourseStatus(lessons, { l1: done, l2: videoOnly })).toBe("completed");
  });
});

describe("extractYoutubeVideoId", () => {
  const id = "dQw4w9WgXcQ";
  it("handles ids and common url shapes", () => {
    expect(extractYoutubeVideoId(id)).toBe(id);
    expect(extractYoutubeVideoId(`https://www.youtube.com/watch?v=${id}&t=3`)).toBe(id);
    expect(extractYoutubeVideoId(`https://youtu.be/${id}`)).toBe(id);
    expect(extractYoutubeVideoId(`https://www.youtube.com/embed/${id}`)).toBe(id);
    expect(extractYoutubeVideoId("nope")).toBeUndefined();
  });
});

describe("lessonSlugs", () => {
  it("makes URL-friendly, unique slugs", () => {
    expect(lessonSlugs(["The Message of the Gospel", "God the Father & God the Son", "The Lord's Prayer", "Lesson"])).toEqual([
      "the-message-of-the-gospel",
      "god-the-father-and-god-the-son",
      "the-lord-s-prayer",
      "lesson",
    ]);
    expect(lessonSlugs(["Intro", "Intro", "Intro"])).toEqual(["intro", "intro-2", "intro-3"]);
    expect(lessonSlugs(["???"])).toEqual(["lesson-1"]);
  });
});
