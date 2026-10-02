ALTER TABLE "training_courses" ADD COLUMN "reminder_frequency" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD COLUMN "last_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "training_enrollments" ADD COLUMN "reminder_count" integer DEFAULT 0 NOT NULL;