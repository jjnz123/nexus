ALTER TABLE "ai_conversations" ADD COLUMN "enabled_skills" jsonb;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "app_sidebar_collapsed" boolean DEFAULT false NOT NULL;