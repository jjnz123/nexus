CREATE TYPE "public"."bookmark_share_resource" AS ENUM('tab', 'group', 'card');--> statement-breakpoint
CREATE TYPE "public"."bookmark_visibility" AS ENUM('everyone', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('epic', 'feature', 'story', 'task');--> statement-breakpoint
CREATE TABLE "bookmark_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" "bookmark_share_resource" NOT NULL,
	"resource_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shared_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmark_tabs" ADD COLUMN "visibility" "bookmark_visibility" DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "type" "task_type" DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "bookmark_shares" ADD CONSTRAINT "bookmark_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark_shares" ADD CONSTRAINT "bookmark_shares_shared_by_users_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmark_shares_resource_idx" ON "bookmark_shares" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "bookmark_shares_user_idx" ON "bookmark_shares" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;