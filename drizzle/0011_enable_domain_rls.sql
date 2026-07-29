-- Supabase exposes the public schema through PostgREST, so every domain table
-- keeps RLS enabled even though this application intentionally defines no
-- browser-facing policies. Server-side Drizzle queries continue through the
-- database owner while anon/authenticated remain blocked by migration 0007.
ALTER TABLE "public"."auth_recovery_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."drill_creation_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."drill_status_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."drill_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."drill_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."drill_training_methods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."drills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."journal_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."status_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."tag_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."training_methods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
