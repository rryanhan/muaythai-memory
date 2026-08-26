CREATE TABLE "capture_rate_limits" (
	"user_id" uuid NOT NULL,
	"action" varchar(32) NOT NULL,
	"window_kind" varchar(16) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_rate_limits_user_id_action_window_kind_window_start_pk" PRIMARY KEY("user_id","action","window_kind","window_start"),
	CONSTRAINT "capture_rate_limits_action_check" CHECK ("capture_rate_limits"."action" in ('transcription', 'cleanup')),
	CONSTRAINT "capture_rate_limits_window_kind_check" CHECK ("capture_rate_limits"."window_kind" in ('burst', 'daily')),
	CONSTRAINT "capture_rate_limits_count_check" CHECK ("capture_rate_limits"."request_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "capture_rate_limits" ADD CONSTRAINT "capture_rate_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_rate_limits_window_idx" ON "capture_rate_limits" USING btree ("window_start");--> statement-breakpoint
ALTER TABLE "drill_steps" ADD CONSTRAINT "drill_steps_body_length_check" CHECK (char_length(btrim("drill_steps"."body")) between 1 and 500);--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_title_length_check" CHECK (char_length(btrim("drills"."title")) between 1 and 120);--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_summary_length_check" CHECK (char_length("drills"."summary") <= 1000);--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_notes_length_check" CHECK ("drills"."notes" is null or char_length("drills"."notes") <= 5000);--> statement-breakpoint
-- Capture quotas are internal server state. Keep the table unavailable through
-- Supabase's Data API even if database default privileges change later.
ALTER TABLE "public"."capture_rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."capture_rate_limits" FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.capture_rate_limits FROM %I',
      api_role
    );
  END LOOP;
END
$$;
