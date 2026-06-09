CREATE TABLE "bookmark_launches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid,
	"source" text NOT NULL,
	"launched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_bookmark_favourites" (
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_bookmark_favourites_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "icon_type" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "icon_value" text;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "accent_color" text DEFAULT '#6366f1' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "open_in_iframe" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmark_cards" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookmark_groups" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "bookmark_groups" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "active_bookmark_tab_id" uuid;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "bookmarks_layout_mode" text DEFAULT 'grid' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "bookmarks_global_layout_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmark_launches" ADD CONSTRAINT "bookmark_launches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark_launches" ADD CONSTRAINT "bookmark_launches_card_id_bookmark_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."bookmark_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bookmark_favourites" ADD CONSTRAINT "user_bookmark_favourites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bookmark_favourites" ADD CONSTRAINT "user_bookmark_favourites_card_id_bookmark_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."bookmark_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmark_launches_user_idx" ON "bookmark_launches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookmark_launches_card_idx" ON "bookmark_launches" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "user_bookmark_favourites_user_idx" ON "user_bookmark_favourites" USING btree ("user_id");