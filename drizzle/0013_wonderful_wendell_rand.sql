CREATE TABLE "drill_shares" (
	"drill_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_shares_drill_id_recipient_user_id_pk" PRIMARY KEY("drill_id","recipient_user_id")
);
--> statement-breakpoint
CREATE TABLE "friend_rate_limits" (
	"user_id" uuid NOT NULL,
	"action" varchar(32) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_rate_limits_user_id_action_window_start_pk" PRIMARY KEY("user_id","action","window_start"),
	CONSTRAINT "friend_rate_limits_action_check" CHECK ("friend_rate_limits"."action" in ('search', 'request', 'report')),
	CONSTRAINT "friend_rate_limits_count_check" CHECK ("friend_rate_limits"."request_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "friend_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_id" uuid NOT NULL,
	"reason" varchar(32) NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_reports_different_users_check" CHECK ("friend_reports"."reporter_id" <> "friend_reports"."reported_id"),
	CONSTRAINT "friend_reports_reason_check" CHECK ("friend_reports"."reason" in ('spam', 'harassment', 'impersonation', 'unsafe-content', 'other'))
);
--> statement-breakpoint
ALTER TABLE "drill_shares" ADD CONSTRAINT "drill_shares_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_shares" ADD CONSTRAINT "drill_shares_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_rate_limits" ADD CONSTRAINT "friend_rate_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_reports" ADD CONSTRAINT "friend_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_reports" ADD CONSTRAINT "friend_reports_reported_id_users_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_shares_recipient_created_idx" ON "drill_shares" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "friend_rate_limits_window_idx" ON "friend_rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "friend_reports_reporter_created_idx" ON "friend_reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "friend_reports_reported_created_idx" ON "friend_reports" USING btree ("reported_id","created_at");--> statement-breakpoint
ALTER TABLE "public"."drill_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."friend_rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."friend_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."drill_shares" FROM "anon", "authenticated";--> statement-breakpoint
REVOKE ALL ON TABLE "public"."friend_rate_limits" FROM "anon", "authenticated";--> statement-breakpoint
REVOKE ALL ON TABLE "public"."friend_reports" FROM "anon", "authenticated";
