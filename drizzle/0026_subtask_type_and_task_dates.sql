ALTER TYPE "task_type" ADD VALUE IF NOT EXISTS 'subtask';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "start_date" timestamp;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "end_date" timestamp;
