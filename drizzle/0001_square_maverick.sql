CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"drill_id" uuid,
	"occurred_on" date NOT NULL,
	"caption" text,
	"status" varchar(32) DEFAULT 'uploading' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"media_kind" varchar(32) DEFAULT 'video' NOT NULL,
	"mime_type" varchar(96) NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_media" ADD CONSTRAINT "journal_media_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_entries_user_occurred_idx" ON "journal_entries" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "journal_entries_user_status_idx" ON "journal_entries" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "journal_entries_drill_id_idx" ON "journal_entries" USING btree ("drill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_media_entry_unique" ON "journal_media" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_media_storage_path_unique" ON "journal_media" USING btree ("storage_path");