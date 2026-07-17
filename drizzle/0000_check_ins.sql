CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" text NOT NULL,
	"event_id" text NOT NULL,
	"occurrence_date" date NOT NULL,
	"profile_id" text NOT NULL,
	"display_name" text NOT NULL,
	"is_child" boolean DEFAULT false NOT NULL,
	"session_id" text,
	"session_name" text,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_by" text NOT NULL,
	"checked_out_at" timestamp with time zone,
	"checked_out_by" text,
	"method" text DEFAULT 'live' NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	CONSTRAINT "check_ins_unique" UNIQUE("series_id","occurrence_date","profile_id"),
	CONSTRAINT "check_ins_method_check" CHECK ("check_ins"."method" in ('live','backfill','kiosk')),
	CONSTRAINT "check_ins_checkout_order_check" CHECK ("check_ins"."checked_out_at" is null or "check_ins"."checked_out_at" >= "check_ins"."checked_in_at")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_hash" text,
	"setup_code" text,
	"setup_expires" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_setup_code_unique" UNIQUE("setup_code")
);
--> statement-breakpoint
CREATE INDEX "check_ins_series_occurrence_idx" ON "check_ins" USING btree ("series_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "check_ins_profile_idx" ON "check_ins" USING btree ("profile_id");