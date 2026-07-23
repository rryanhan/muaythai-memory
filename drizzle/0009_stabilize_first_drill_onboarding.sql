ALTER TABLE "drills" ADD COLUMN "creation_key" varchar(36);--> statement-breakpoint
ALTER TABLE "drills" ADD COLUMN "creation_payload_hash" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "drills_user_creation_key_unique" ON "drills" USING btree ("user_id","creation_key");--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_creation_idempotency_check" CHECK (("drills"."creation_key" is null and "drills"."creation_payload_hash" is null) or ("drills"."creation_key" is not null and "drills"."creation_payload_hash" is not null));--> statement-breakpoint
UPDATE "users"
SET "first_drill_guide_skipped_at" = NULL
WHERE "first_drill_guide_completed_at" IS NOT NULL
  AND "first_drill_guide_skipped_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_first_drill_guide_state_check" CHECK ("users"."first_drill_guide_completed_at" is null or "users"."first_drill_guide_skipped_at" is null);
