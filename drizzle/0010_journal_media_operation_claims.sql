ALTER TABLE "journal_entries" ADD COLUMN "media_operation" varchar(32);--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "media_operation_token" uuid;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "media_operation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_media_operation_check" CHECK ((
        "journal_entries"."media_operation" is null
        and "journal_entries"."media_operation_token" is null
        and "journal_entries"."media_operation_started_at" is null
      ) or (
        "journal_entries"."media_operation" in ('poster', 'complete', 'delete', 'cleanup')
        and "journal_entries"."media_operation_token" is not null
        and "journal_entries"."media_operation_started_at" is not null
      ));--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."journal_entries" FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL PRIVILEGES ON TABLE "public"."journal_entries" FROM anon;
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL PRIVILEGES ON TABLE "public"."journal_entries" FROM authenticated;
	END IF;
END
$$;
