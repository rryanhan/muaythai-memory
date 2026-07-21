ALTER TABLE "users" ADD COLUMN "username" varchar(30);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" varchar(80);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" varchar(80);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_drill_guide_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_drill_guide_skipped_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");
