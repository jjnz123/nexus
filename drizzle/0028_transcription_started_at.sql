ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "transcription_started_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "meetings_transcription_queue_idx"
  ON "meetings" ("status", "transcription_started_at");
