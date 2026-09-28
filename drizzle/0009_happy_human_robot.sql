ALTER TABLE "training_lessons" ALTER COLUMN "youtube_video_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "training_lessons" ADD COLUMN "type" text DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_lessons" ADD COLUMN "handout_url" text;