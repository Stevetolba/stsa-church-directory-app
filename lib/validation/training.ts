import { z } from "zod";
import { extractYoutubeVideoId } from "../youtube";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes")
  .max(80);

export const courseInputSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000).nullable().optional().transform((v) => v || null),
  coverImageUrl: z.string().trim().url().max(2000).nullable().optional().or(z.literal("")).transform((v) => v || null),
  audience: z.enum(["all", "volunteer"]).default("all"),
  published: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  // A Subsplash custom-field name — the per-course choice field the status is written to.
  subsplashFieldName: z.string().trim().max(100).nullable().optional().transform((v) => v || null),
  passThreshold: z.number().int().min(0).max(100).default(80),
});
export type CourseInputValues = z.infer<typeof courseInputSchema>;

export const lessonInputSchema = z.object({
  sortOrder: z.number().int().min(0).max(10000).default(0),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(20000).nullable().optional().transform((v) => v || null),
  // Accepts a full URL or bare id; stored as the bare id.
  youtubeVideoId: z
    .string()
    .trim()
    .transform((v) => extractYoutubeVideoId(v))
    .pipe(z.string({ error: "Enter a valid YouTube link or video id" })),
  minWatchPct: z.number().int().min(1).max(100).default(90),
  published: z.boolean().default(false),
});
export type LessonInputValues = z.infer<typeof lessonInputSchema>;

export const questionsInputSchema = z.object({
  questions: z
    .array(
      z
        .object({
          prompt: z.string().trim().min(1, "Question text is required").max(1000),
          kind: z.enum(["single", "multi", "true_false"]),
          options: z
            .array(z.object({ id: z.string().min(1).max(20), text: z.string().trim().min(1).max(500) }))
            .min(2)
            .max(8),
          correctOptionIds: z.array(z.string()).min(1),
        })
        .refine((q) => q.correctOptionIds.every((id) => q.options.some((o) => o.id === id)), {
          message: "Correct answers must be among the options",
        })
        .refine((q) => q.kind === "multi" || q.correctOptionIds.length === 1, {
          message: "Only multi-select questions can have several correct answers",
        })
    )
    .max(50),
});

export const watchSchema = z.object({ pct: z.number().min(0).max(100) });

export const quizSubmitSchema = z.object({
  answers: z.record(z.string(), z.array(z.string()).max(10)),
});

export const invitationSchema = z.object({
  profileIds: z.array(z.string().min(1)).min(1).max(500),
  courseIds: z.array(z.string().min(1)).min(1).max(20),
  sendEmail: z.boolean().default(true),
});
