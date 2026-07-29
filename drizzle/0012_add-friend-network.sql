CREATE TABLE "friendships" (
	"user_one_id" uuid NOT NULL,
	"user_two_id" uuid NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_one_id_user_two_id_pk" PRIMARY KEY("user_one_id","user_two_id"),
	CONSTRAINT "friendships_ordered_pair_check" CHECK ("friendships"."user_one_id" < "friendships"."user_two_id"),
	CONSTRAINT "friendships_requester_member_check" CHECK ("friendships"."requested_by_id" = "friendships"."user_one_id" or "friendships"."requested_by_id" = "friendships"."user_two_id"),
	CONSTRAINT "friendships_status_check" CHECK ("friendships"."status" in ('pending', 'accepted')),
	CONSTRAINT "friendships_response_state_check" CHECK ((
        ("friendships"."status" = 'pending' and "friendships"."responded_at" is null)
        or ("friendships"."status" = 'accepted' and "friendships"."responded_at" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "user_blocks_different_users_check" CHECK ("user_blocks"."blocker_id" <> "user_blocks"."blocked_id")
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_one_id_users_id_fk" FOREIGN KEY ("user_one_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_two_id_users_id_fk" FOREIGN KEY ("user_two_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friendships_user_two_id_idx" ON "friendships" USING btree ("user_two_id");--> statement-breakpoint
CREATE INDEX "friendships_requested_by_id_idx" ON "friendships" USING btree ("requested_by_id");--> statement-breakpoint
CREATE INDEX "friendships_status_idx" ON "friendships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."friendships" FROM "anon", "authenticated";--> statement-breakpoint
REVOKE ALL ON TABLE "public"."user_blocks" FROM "anon", "authenticated";
