ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "details" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "acceptance_criteria" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "definition_of_done" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "story_points" integer;--> statement-breakpoint
ALTER TABLE "task_comments" ADD COLUMN IF NOT EXISTS "parent_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_parent_id_task_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."task_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "mime_type" text DEFAULT 'application/octet-stream';--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."task_link_type" AS ENUM('relates_to', 'blocks', 'duplicates');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_task_id" uuid NOT NULL,
	"target_task_id" uuid NOT NULL,
	"link_type" "task_link_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_links" ADD CONSTRAINT "task_links_source_task_id_tasks_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_links" ADD CONSTRAINT "task_links_target_task_id_tasks_id_fk" FOREIGN KEY ("target_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_links_unique_idx" ON "task_links" USING btree ("source_task_id","target_task_id","link_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_links_source_idx" ON "task_links" USING btree ("source_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_links_target_idx" ON "task_links" USING btree ("target_task_id");
