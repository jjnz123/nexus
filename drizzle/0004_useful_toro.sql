CREATE TABLE "favicon_cache" (
	"domain" text PRIMARY KEY NOT NULL,
	"favicon_path" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "favicon_path" text;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "auto_title" text;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "auto_description" text;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "health_monitoring_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "linked_device_id" uuid;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "click_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "last_clicked_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookmark_launches" ADD COLUMN "referrer" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "bookmarks_sort_mode" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD CONSTRAINT "bookmark_cards_linked_device_id_monitor_devices_id_fk" FOREIGN KEY ("linked_device_id") REFERENCES "public"."monitor_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmark_launches_launched_at_idx" ON "bookmark_launches" USING btree ("launched_at");