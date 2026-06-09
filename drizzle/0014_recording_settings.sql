ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "recording_audio_mime_type" text DEFAULT 'audio/webm;codecs=opus' NOT NULL;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "recording_audio_bitrate_kbps" integer DEFAULT 96 NOT NULL;
