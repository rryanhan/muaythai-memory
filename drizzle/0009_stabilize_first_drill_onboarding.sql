CREATE TABLE "drill_creation_keys" (
	"user_id" uuid NOT NULL,
	"creation_key" varchar(36) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"drill_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_creation_keys_user_id_creation_key_pk" PRIMARY KEY("user_id","creation_key")
);
--> statement-breakpoint
ALTER TABLE "drill_creation_keys" ADD CONSTRAINT "drill_creation_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_creation_keys" ADD CONSTRAINT "drill_creation_keys_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_creation_keys_drill_id_idx" ON "drill_creation_keys" USING btree ("drill_id");--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."drill_creation_keys" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL PRIVILEGES ON TABLE "public"."drill_creation_keys" FROM anon;
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL PRIVILEGES ON TABLE "public"."drill_creation_keys" FROM authenticated;
	END IF;
END
$$;--> statement-breakpoint
UPDATE "users"
SET "first_drill_guide_skipped_at" = NULL
WHERE "first_drill_guide_completed_at" IS NOT NULL
  AND "first_drill_guide_skipped_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_first_drill_guide_state_check" CHECK ("users"."first_drill_guide_completed_at" is null or "users"."first_drill_guide_skipped_at" is null);
