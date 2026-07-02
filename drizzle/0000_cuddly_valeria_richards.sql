CREATE TABLE "drill_status_tags" (
	"drill_id" uuid NOT NULL,
	"status_tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_status_tags_drill_id_status_tag_id_pk" PRIMARY KEY("drill_id","status_tag_id")
);
--> statement-breakpoint
CREATE TABLE "drill_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drill_tags" (
	"drill_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_tags_drill_id_tag_id_pk" PRIMARY KEY("drill_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "drill_training_methods" (
	"drill_id" uuid NOT NULL,
	"training_method_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_training_methods_drill_id_training_method_id_pk" PRIMARY KEY("drill_id","training_method_id")
);
--> statement-breakpoint
CREATE TABLE "drills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"notes" text,
	"source_transcript" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(96) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(96) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"category_id" uuid,
	"name" text NOT NULL,
	"slug" varchar(96) NOT NULL,
	"kind" varchar(32) DEFAULT 'standard' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(96) NOT NULL,
	"icon_key" varchar(96) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drill_status_tags" ADD CONSTRAINT "drill_status_tags_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_status_tags" ADD CONSTRAINT "drill_status_tags_status_tag_id_status_tags_id_fk" FOREIGN KEY ("status_tag_id") REFERENCES "public"."status_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_steps" ADD CONSTRAINT "drill_steps_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_tags" ADD CONSTRAINT "drill_tags_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_tags" ADD CONSTRAINT "drill_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_training_methods" ADD CONSTRAINT "drill_training_methods_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_training_methods" ADD CONSTRAINT "drill_training_methods_training_method_id_training_methods_id_fk" FOREIGN KEY ("training_method_id") REFERENCES "public"."training_methods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_category_id_tag_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tag_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_status_tags_status_tag_id_idx" ON "drill_status_tags" USING btree ("status_tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drill_steps_drill_position_unique" ON "drill_steps" USING btree ("drill_id","position");--> statement-breakpoint
CREATE INDEX "drill_steps_drill_id_idx" ON "drill_steps" USING btree ("drill_id");--> statement-breakpoint
CREATE INDEX "drill_tags_tag_id_idx" ON "drill_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "drill_training_methods_method_id_idx" ON "drill_training_methods" USING btree ("training_method_id");--> statement-breakpoint
CREATE INDEX "drills_user_id_idx" ON "drills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drills_title_idx" ON "drills" USING btree ("title");--> statement-breakpoint
CREATE INDEX "drills_archived_at_idx" ON "drills" USING btree ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "status_tags_slug_unique" ON "status_tags" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_categories_slug_unique" ON "tag_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tags_category_id_idx" ON "tags" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "tags_user_id_idx" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_system_slug_unique" ON "tags" USING btree ("slug") WHERE "tags"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_slug_unique" ON "tags" USING btree ("user_id","slug") WHERE "tags"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "training_methods_slug_unique" ON "training_methods" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "users_display_name_idx" ON "users" USING btree ("display_name");