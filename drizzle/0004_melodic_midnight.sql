ALTER TABLE "devices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "devices" CASCADE;--> statement-breakpoint
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_method_check";--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_method_check" CHECK ("check_ins"."method" in ('live','backfill','kiosk','subsplash'));