CREATE TABLE "ai_conversation_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"path" text NOT NULL,
	"filename" text NOT NULL,
	"display_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"text_preview" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"path" text NOT NULL,
	"filename" text NOT NULL,
	"display_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"text_preview" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_messages" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "chat_sidebar_collapsed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_conversation_files" ADD CONSTRAINT "ai_conversation_files_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation_files" ADD CONSTRAINT "ai_conversation_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_project_files" ADD CONSTRAINT "ai_project_files_project_id_ai_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."ai_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_project_files" ADD CONSTRAINT "ai_project_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversation_files_conversation_idx" ON "ai_conversation_files" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_conversation_files_user_idx" ON "ai_conversation_files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_project_files_project_idx" ON "ai_project_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_project_files_user_idx" ON "ai_project_files" USING btree ("user_id");