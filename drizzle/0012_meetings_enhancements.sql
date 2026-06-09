ALTER TABLE "meetings" ADD COLUMN "meeting_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
UPDATE "meetings" SET "meeting_at" = "created_at" WHERE "meeting_at" IS NULL;--> statement-breakpoint
CREATE INDEX "meetings_archived_at_idx" ON "meetings" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "meetings_meeting_at_idx" ON "meetings" USING btree ("meeting_at");
