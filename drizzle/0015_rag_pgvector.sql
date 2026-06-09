CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "rag_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "content_hash" text,
  "title" text NOT NULL,
  "mime_type" text,
  "ai_project_id" uuid REFERENCES "ai_projects"("id") ON DELETE CASCADE,
  "ai_conversation_id" uuid REFERENCES "ai_conversations"("id") ON DELETE CASCADE,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "token_estimate" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "rag_chunks_user_id_idx" ON "rag_chunks" ("user_id");
CREATE INDEX IF NOT EXISTS "rag_chunks_source_idx" ON "rag_chunks" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "rag_chunks_project_idx" ON "rag_chunks" ("ai_project_id");
CREATE INDEX IF NOT EXISTS "rag_chunks_conversation_idx" ON "rag_chunks" ("ai_conversation_id");
CREATE INDEX IF NOT EXISTS "rag_chunks_embedding_hnsw_idx" ON "rag_chunks" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE IF NOT EXISTS "rag_index_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "content_hash" text NOT NULL,
  "chunk_count" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'indexed' NOT NULL,
  "error_message" text,
  "indexed_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "rag_index_state_source_unique" UNIQUE("source_type", "source_id")
);

CREATE INDEX IF NOT EXISTS "rag_index_state_source_idx" ON "rag_index_state" ("source_type", "source_id");
