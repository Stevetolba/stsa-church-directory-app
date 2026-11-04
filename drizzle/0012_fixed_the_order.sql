CREATE TABLE "attendance_report_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campus" text NOT NULL,
	"sunday_date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "attendance_report_sends_campus_sunday_unique" UNIQUE("campus","sunday_date")
);
