CREATE TABLE "attendance_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"series_id" text NOT NULL,
	"occurrence_date" date NOT NULL,
	"rows_seen" integer NOT NULL,
	"rows_matched" integer NOT NULL,
	"rows_unmatched" integer NOT NULL,
	"unmatched_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "attendance_imports_series_occurrence_idx" ON "attendance_imports" USING btree ("series_id","occurrence_date");