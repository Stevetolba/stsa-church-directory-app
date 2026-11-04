CREATE TABLE "household_update_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"subject_label" text,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"decision" text DEFAULT 'pending' NOT NULL,
	"applied_at" timestamp with time zone,
	"apply_error" text,
	"created_profile_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_update_changes_unique_field" UNIQUE("request_id","subject_type","subject_id","field"),
	CONSTRAINT "household_update_changes_decision_check" CHECK ("household_update_changes"."decision" in ('pending','accepted','rejected'))
);
--> statement-breakpoint
CREATE TABLE "household_update_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" text NOT NULL,
	"household_name" text,
	"submitted_by_profile_id" text NOT NULL,
	"submitted_by_email" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone,
	"reviewed_by_email" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_update_requests_status_check" CHECK ("household_update_requests"."status" in ('draft','pending','applied','partially_applied','rejected'))
);
--> statement-breakpoint
ALTER TABLE "access_events" DROP CONSTRAINT "access_events_role_check";--> statement-breakpoint
ALTER TABLE "access_events" DROP CONSTRAINT "access_events_event_type_check";--> statement-breakpoint
ALTER TABLE "login_codes" ADD COLUMN "purpose" text DEFAULT 'training' NOT NULL;--> statement-breakpoint
ALTER TABLE "household_update_changes" ADD CONSTRAINT "household_update_changes_request_id_household_update_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."household_update_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_update_changes_request_idx" ON "household_update_changes" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "household_update_requests_household_idx" ON "household_update_requests" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "household_update_requests_status_idx" ON "household_update_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "household_update_requests_one_open_idx" ON "household_update_requests" USING btree ("household_id") WHERE "household_update_requests"."status" in ('draft','pending');--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_role_check" CHECK ("access_events"."role" in ('admin','staff','volunteer','learner','household'));--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_event_type_check" CHECK ("access_events"."event_type" in ('sign_in','sign_in_denied','directory_read','household_update_view','household_update_submit','household_update_apply'));--> statement-breakpoint
ALTER TABLE "login_codes" ADD CONSTRAINT "login_codes_purpose_check" CHECK ("login_codes"."purpose" in ('training','household'));