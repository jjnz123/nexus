CREATE TYPE "public"."user_status" AS ENUM('pending', 'member', 'administrator');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('recording', 'processing', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_backup_codes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_login_at" timestamp;--> statement-breakpoint
UPDATE "users" SET "status" = 'administrator' WHERE "role" = 'admin';--> statement-breakpoint
UPDATE "users" SET "status" = 'member' WHERE "role" != 'admin';--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"status" "meeting_status" DEFAULT 'recording' NOT NULL,
	"audio_path" text,
	"audio_filename" text,
	"audio_mime_type" text,
	"audio_size" integer,
	"transcript" text,
	"summary" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "meeting_action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_hint" text,
	"priority" "task_priority" DEFAULT 'medium',
	"converted_task_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "meeting_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_converted_task_id_tasks_id_fk" FOREIGN KEY ("converted_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_messages" ADD CONSTRAINT "meeting_messages_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meetings_user_idx" ON "meetings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meetings_project_idx" ON "meetings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "meetings_created_at_idx" ON "meetings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "meeting_action_items_meeting_idx" ON "meeting_action_items" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_messages_meeting_idx" ON "meeting_messages" USING btree ("meeting_id");
