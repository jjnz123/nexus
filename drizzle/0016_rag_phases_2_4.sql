ALTER TABLE "rag_chunks" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT 'user' NOT NULL;
ALTER TABLE "rag_chunks" ADD COLUMN IF NOT EXISTS "meeting_id" uuid REFERENCES "meetings"("id") ON DELETE CASCADE;
ALTER TABLE "rag_chunks" ADD COLUMN IF NOT EXISTS "note_id" uuid REFERENCES "user_notes"("id") ON DELETE CASCADE;
ALTER TABLE "rag_chunks" ADD COLUMN IF NOT EXISTS "task_id" uuid REFERENCES "tasks"("id") ON DELETE CASCADE;
ALTER TABLE "rag_chunks" ADD COLUMN IF NOT EXISTS "kanban_project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "rag_chunks" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

CREATE INDEX IF NOT EXISTS "rag_chunks_scope_idx" ON "rag_chunks" ("scope");
CREATE INDEX IF NOT EXISTS "rag_chunks_meeting_idx" ON "rag_chunks" ("meeting_id");
CREATE INDEX IF NOT EXISTS "rag_chunks_note_idx" ON "rag_chunks" ("note_id");
CREATE INDEX IF NOT EXISTS "rag_chunks_task_idx" ON "rag_chunks" ("task_id");
CREATE INDEX IF NOT EXISTS "rag_chunks_kanban_project_idx" ON "rag_chunks" ("kanban_project_id");
CREATE INDEX IF NOT EXISTS "rag_chunks_search_vector_idx" ON "rag_chunks" USING gin ("search_vector");

UPDATE "rag_chunks"
SET "search_vector" = to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", ''))
WHERE "search_vector" IS NULL;

CREATE TABLE IF NOT EXISTS "rag_retrieval_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "query" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "chunk_id" uuid REFERENCES "rag_chunks"("id") ON DELETE SET NULL,
  "similarity" double precision,
  "context" text DEFAULT 'chat' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "rag_retrieval_logs_created_at_idx" ON "rag_retrieval_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "rag_retrieval_logs_source_idx" ON "rag_retrieval_logs" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "rag_retrieval_logs_user_idx" ON "rag_retrieval_logs" ("user_id");
