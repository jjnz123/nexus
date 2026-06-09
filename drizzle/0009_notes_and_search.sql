CREATE TABLE "user_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'plaintext' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "notes_workspace" jsonb DEFAULT '{"openTabIds":[],"activeTabId":null,"previewVisible":true,"explorerCollapsed":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_notes_user_idx" ON "user_notes" USING btree ("user_id");
