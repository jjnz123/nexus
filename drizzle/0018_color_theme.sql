ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "color_theme" text DEFAULT 'dark' NOT NULL;
