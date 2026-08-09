CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id"),
	CONSTRAINT "follows_no_self_follow_check" CHECK ("follows"."follower_id" <> "follows"."following_id"),
	CONSTRAINT "follows_status_check" CHECK ("follows"."status" in ('pending', 'accepted')),
	CONSTRAINT "follows_response_state_check" CHECK ((
        ("follows"."status" = 'pending' and "follows"."responded_at" is null)
        or ("follows"."status" = 'accepted' and "follows"."responded_at" is not null)
      ))
);
--> statement-breakpoint
ALTER TABLE "friend_rate_limits" DROP CONSTRAINT "friend_rate_limits_action_check";--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_follower_status_idx" ON "follows" USING btree ("follower_id","status");--> statement-breakpoint
CREATE INDEX "follows_following_status_idx" ON "follows" USING btree ("following_id","status");--> statement-breakpoint
UPDATE "friend_rate_limits" SET "action" = 'follow' WHERE "action" = 'request';--> statement-breakpoint
-- Keep the legacy `request` value during the expand deployment. The contract
-- migration removes it after all application traffic uses `follow`.
ALTER TABLE "friend_rate_limits" ADD CONSTRAINT "friend_rate_limits_action_check" CHECK ("friend_rate_limits"."action" in ('search', 'request', 'follow', 'report'));--> statement-breakpoint

-- Accepted friendships become reciprocal accepted follows. The upsert makes
-- the data copy safe to re-run while validating the staging migration.
INSERT INTO "follows" (
	"follower_id",
	"following_id",
	"status",
	"responded_at",
	"created_at",
	"updated_at"
)
SELECT
	"user_one_id",
	"user_two_id",
	'accepted',
	coalesce("responded_at", "updated_at"),
	"created_at",
	"updated_at"
FROM "friendships"
WHERE "status" = 'accepted'
UNION ALL
SELECT
	"user_two_id",
	"user_one_id",
	'accepted',
	coalesce("responded_at", "updated_at"),
	"created_at",
	"updated_at"
FROM "friendships"
WHERE "status" = 'accepted'
ON CONFLICT ("follower_id", "following_id") DO UPDATE SET
	"status" = excluded."status",
	"responded_at" = excluded."responded_at",
	"updated_at" = excluded."updated_at";--> statement-breakpoint

-- A pending friendship has one request direction. Never downgrade an
-- accepted follow if this copy is intentionally re-run.
INSERT INTO "follows" (
	"follower_id",
	"following_id",
	"status",
	"responded_at",
	"created_at",
	"updated_at"
)
SELECT
	"requested_by_id",
	case
		when "requested_by_id" = "user_one_id" then "user_two_id"
		else "user_one_id"
	end,
	'pending',
	null,
	"created_at",
	"updated_at"
FROM "friendships"
WHERE "status" = 'pending'
ON CONFLICT ("follower_id", "following_id") DO NOTHING;--> statement-breakpoint

-- Keep late writes from a previous deployment visible during the expand
-- rollout. New code writes follows directly; this bridge is removed with the
-- legacy friendships table in the later contract migration.
CREATE OR REPLACE FUNCTION "public"."mirror_friendship_to_follows"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
	row_user_one uuid;
	row_user_two uuid;
BEGIN
	IF TG_OP = 'DELETE' THEN
		row_user_one := OLD."user_one_id";
		row_user_two := OLD."user_two_id";
	ELSE
		row_user_one := NEW."user_one_id";
		row_user_two := NEW."user_two_id";
	END IF;

	DELETE FROM "public"."follows"
	WHERE ("follower_id" = row_user_one AND "following_id" = row_user_two)
		OR ("follower_id" = row_user_two AND "following_id" = row_user_one);

	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;

	IF NEW."status" = 'accepted' THEN
		INSERT INTO "public"."follows" (
			"follower_id", "following_id", "status", "responded_at", "created_at", "updated_at"
		) VALUES
			(
				NEW."user_one_id", NEW."user_two_id", 'accepted',
				coalesce(NEW."responded_at", NEW."updated_at"), NEW."created_at", NEW."updated_at"
			),
			(
				NEW."user_two_id", NEW."user_one_id", 'accepted',
				coalesce(NEW."responded_at", NEW."updated_at"), NEW."created_at", NEW."updated_at"
			);
	ELSE
		INSERT INTO "public"."follows" (
			"follower_id", "following_id", "status", "responded_at", "created_at", "updated_at"
		) VALUES (
			NEW."requested_by_id",
			case
				when NEW."requested_by_id" = NEW."user_one_id" then NEW."user_two_id"
				else NEW."user_one_id"
			end,
			'pending',
			null,
			NEW."created_at",
			NEW."updated_at"
		);
	END IF;

	RETURN NEW;
END;
$function$;--> statement-breakpoint
CREATE TRIGGER "friendships_mirror_follows_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "public"."friendships"
FOR EACH ROW EXECUTE FUNCTION "public"."mirror_friendship_to_follows"();--> statement-breakpoint

ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."follows" FROM "anon", "authenticated";--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."mirror_friendship_to_follows"() FROM PUBLIC, "anon", "authenticated";
