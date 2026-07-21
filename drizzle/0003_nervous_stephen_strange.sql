CREATE TABLE "access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"event_type" text NOT NULL,
	"resource" text,
	CONSTRAINT "access_events_role_check" CHECK ("access_events"."role" in ('admin','staff','volunteer')),
	CONSTRAINT "access_events_event_type_check" CHECK ("access_events"."event_type" in ('sign_in','sign_in_denied','directory_read'))
);
--> statement-breakpoint
CREATE INDEX "access_events_occurred_at_idx" ON "access_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "access_events_email_idx" ON "access_events" USING btree ("email");