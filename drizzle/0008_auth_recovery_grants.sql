CREATE TABLE "auth_recovery_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"jti_hash" varchar(64) NOT NULL,
	"session_hash" varchar(64) NOT NULL,
	"state" varchar(16) DEFAULT 'issued' NOT NULL,
	"password_fingerprint" varchar(64),
	"active_attempts" integer DEFAULT 0 NOT NULL,
	"outcome_uncertain" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"pending_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_recovery_grants_state_check" CHECK ("auth_recovery_grants"."state" in ('issued', 'pending', 'consumed', 'failed')),
	CONSTRAINT "auth_recovery_grants_active_attempts_check" CHECK ("auth_recovery_grants"."active_attempts" >= 0),
	CONSTRAINT "auth_recovery_grants_lifecycle_check" CHECK ((
        ("auth_recovery_grants"."state" = 'issued'
          and "auth_recovery_grants"."password_fingerprint" is null
          and "auth_recovery_grants"."active_attempts" = 0
          and "auth_recovery_grants"."outcome_uncertain" = false
          and "auth_recovery_grants"."pending_at" is null
          and "auth_recovery_grants"."consumed_at" is null
          and "auth_recovery_grants"."failed_at" is null)
        or
        ("auth_recovery_grants"."state" = 'failed'
          and "auth_recovery_grants"."password_fingerprint" is null
          and "auth_recovery_grants"."active_attempts" = 0
          and "auth_recovery_grants"."outcome_uncertain" = false
          and "auth_recovery_grants"."pending_at" is null
          and "auth_recovery_grants"."consumed_at" is null
          and "auth_recovery_grants"."failed_at" is not null)
        or
        ("auth_recovery_grants"."state" = 'pending'
          and "auth_recovery_grants"."password_fingerprint" is not null
          and ("auth_recovery_grants"."active_attempts" > 0 or "auth_recovery_grants"."outcome_uncertain" = true)
          and "auth_recovery_grants"."pending_at" is not null
          and "auth_recovery_grants"."consumed_at" is null
          and "auth_recovery_grants"."failed_at" is null)
        or
        ("auth_recovery_grants"."state" = 'consumed'
          and "auth_recovery_grants"."password_fingerprint" is not null
          and "auth_recovery_grants"."active_attempts" = 0
          and "auth_recovery_grants"."outcome_uncertain" = false
          and "auth_recovery_grants"."pending_at" is not null
          and "auth_recovery_grants"."consumed_at" is not null
          and "auth_recovery_grants"."failed_at" is null)
      ))
);
--> statement-breakpoint
ALTER TABLE "auth_recovery_grants" ADD CONSTRAINT "auth_recovery_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_recovery_grants_jti_hash_unique" ON "auth_recovery_grants" USING btree ("jti_hash");--> statement-breakpoint
CREATE INDEX "auth_recovery_grants_user_id_idx" ON "auth_recovery_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_recovery_grants_expires_at_idx" ON "auth_recovery_grants" USING btree ("expires_at");--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."auth_recovery_grants" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL PRIVILEGES ON TABLE "public"."auth_recovery_grants" FROM anon;
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL PRIVILEGES ON TABLE "public"."auth_recovery_grants" FROM authenticated;
	END IF;
END
$$;
