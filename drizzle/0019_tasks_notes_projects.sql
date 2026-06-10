ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "active_kanban_project_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_active_kanban_project_id_projects_id_fk" FOREIGN KEY ("active_kanban_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "user_notes" ADD COLUMN IF NOT EXISTS "project_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_notes_project_idx" ON "user_notes" USING btree ("project_id");
