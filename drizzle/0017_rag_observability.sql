ALTER TABLE "rag_retrieval_logs" ADD COLUMN IF NOT EXISTS "keyword_score" real;
ALTER TABLE "rag_retrieval_logs" ADD COLUMN IF NOT EXISTS "fused_score" real;
ALTER TABLE "rag_retrieval_logs" ADD COLUMN IF NOT EXISTS "used_in_context" boolean DEFAULT true NOT NULL;
ALTER TABLE "rag_retrieval_logs" ADD COLUMN IF NOT EXISTS "run_id" uuid;

CREATE TABLE IF NOT EXISTS "rag_retrieval_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "query" text NOT NULL,
  "rewritten_query" text,
  "context" text DEFAULT 'chat' NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "vector_count" integer DEFAULT 0 NOT NULL,
  "keyword_count" integer DEFAULT 0 NOT NULL,
  "fused_count" integer DEFAULT 0 NOT NULL,
  "used_count" integer DEFAULT 0 NOT NULL,
  "duration_ms" integer,
  "success" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "rag_retrieval_runs_created_at_idx" ON "rag_retrieval_runs" ("created_at");
CREATE INDEX IF NOT EXISTS "rag_retrieval_runs_user_idx" ON "rag_retrieval_runs" ("user_id");
CREATE INDEX IF NOT EXISTS "rag_retrieval_logs_run_idx" ON "rag_retrieval_logs" ("run_id");
