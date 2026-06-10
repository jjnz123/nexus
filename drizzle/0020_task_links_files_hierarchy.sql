ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'file' NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "url" text;
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "display_title" text;
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "is_current" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "email_subject" text;
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "email_from" text;
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "email_sent_at" timestamp;
--> statement-breakpoint
ALTER TABLE "task_attachments" ALTER COLUMN "path" DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_attachments_task_kind_idx" ON "task_attachments" USING btree ("task_id", "kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_attachments_group_idx" ON "task_attachments" USING btree ("group_id");
