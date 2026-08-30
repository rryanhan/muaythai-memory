SET LOCAL lock_timeout = '5s';--> statement-breakpoint

-- Fail closed unless the exact expand migration and its canonical target are
-- present. Holding an ACCESS SHARE lock keeps follows in place for the rest of
-- this transaction.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM "drizzle"."__drizzle_migrations"
		WHERE "created_at" = 1786304472349
	) THEN
		RAISE EXCEPTION 'Required directed-follows expand migration 0014 is missing';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM "pg_class" relation
		JOIN "pg_namespace" namespace ON namespace.oid = relation.relnamespace
		WHERE namespace.nspname = 'public'
			AND relation.relname = 'follows'
			AND relation.relkind IN ('r', 'p')
	) THEN
		RAISE EXCEPTION 'Required canonical public.follows table is missing';
	END IF;
END
$$;--> statement-breakpoint
LOCK TABLE "public"."follows" IN ACCESS SHARE MODE;--> statement-breakpoint

-- Stop the expand-phase bridge before changing its source table. The short
-- timeout avoids waiting indefinitely on active legacy writers; release
-- verification must separately prove that old application code is off-traffic.
LOCK TABLE "public"."friendships" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint

-- Merge any late legacy rate-limit buckets into the canonical follow action.
-- Summing on conflict preserves both counters instead of discarding one.
INSERT INTO "public"."friend_rate_limits" (
	"user_id",
	"action",
	"window_start",
	"request_count",
	"updated_at"
)
SELECT
	"user_id",
	'follow',
	"window_start",
	"request_count",
	"updated_at"
FROM "public"."friend_rate_limits"
WHERE "action" = 'request'
ON CONFLICT ("user_id", "action", "window_start") DO UPDATE SET
	"request_count" = "friend_rate_limits"."request_count" + excluded."request_count",
	"updated_at" = greatest("friend_rate_limits"."updated_at", excluded."updated_at");--> statement-breakpoint
DELETE FROM "public"."friend_rate_limits" WHERE "action" = 'request';--> statement-breakpoint

ALTER TABLE "public"."friend_rate_limits"
	DROP CONSTRAINT "friend_rate_limits_action_check";--> statement-breakpoint
ALTER TABLE "public"."friend_rate_limits"
	ADD CONSTRAINT "friend_rate_limits_action_check"
	CHECK ("friend_rate_limits"."action" in ('search', 'follow', 'report'));--> statement-breakpoint

-- Follows have been authoritative since the expand migration. Do not copy
-- from friendships here: a stale legacy pending row may represent a request
-- that was subsequently canceled in follows.
DROP TRIGGER "friendships_mirror_follows_trigger" ON "public"."friendships";--> statement-breakpoint
DROP FUNCTION "public"."mirror_friendship_to_follows"();--> statement-breakpoint
DROP TABLE "public"."friendships";
