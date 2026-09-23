CREATE TABLE "custom_field_meta_cache" (
	"field_name" text PRIMARY KEY NOT NULL,
	"definition_id" text NOT NULL,
	"revision_id" text,
	"type" text,
	"choice_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_course_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"course_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp with time zone,
	"subsplash_synced_status" text,
	"subsplash_sync_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_course_status_unique" UNIQUE("profile_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "training_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_image_url" text,
	"audience" text DEFAULT 'all' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"subsplash_field_name" text,
	"pass_threshold" integer DEFAULT 80 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "training_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"invited_by" text NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "training_enrollments_unique" UNIQUE("profile_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "training_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"youtube_video_id" text NOT NULL,
	"min_watch_pct" integer DEFAULT 90 NOT NULL,
	"published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"lesson_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"watched_pct" integer DEFAULT 0 NOT NULL,
	"video_completed_at" timestamp with time zone,
	"quiz_score" integer,
	"quiz_passed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_progress_unique" UNIQUE("profile_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "training_quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"prompt" text NOT NULL,
	"kind" text DEFAULT 'single' NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option_ids" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_course_status" ADD CONSTRAINT "training_course_status_course_id_training_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_course_id_training_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_lessons" ADD CONSTRAINT "training_lessons_course_id_training_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_lesson_id_training_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."training_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_course_id_training_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_quiz_questions" ADD CONSTRAINT "training_quiz_questions_lesson_id_training_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."training_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_course_status_course_idx" ON "training_course_status" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "training_enrollments_profile_idx" ON "training_enrollments" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "training_lessons_course_idx" ON "training_lessons" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "training_progress_profile_idx" ON "training_progress" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "training_progress_course_idx" ON "training_progress" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "training_quiz_questions_lesson_idx" ON "training_quiz_questions" USING btree ("lesson_id");