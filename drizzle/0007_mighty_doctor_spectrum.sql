CREATE TABLE "calendar_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"events_seen" integer NOT NULL,
	"events_created" integer NOT NULL,
	"events_updated" integer NOT NULL,
	"events_deleted" integer NOT NULL,
	"error" text
);
