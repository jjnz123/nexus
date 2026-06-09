import { and, eq } from "drizzle-orm";
import { db, getSqlClient } from "@/lib/db";
import { ragChunks, ragIndexState, type RagSourceType } from "@/lib/db/schema";
import { embeddingToVectorLiteral } from "@/lib/rag/embeddings";
import type { RetrievedRagChunk } from "@/lib/rag/types";
import { RAG_DEFAULT_TOP_K, RAG_MIN_SIMILARITY } from "@/lib/rag/types";

type InsertChunk = {
  userId: string;
  sourceType: RagSourceType;
  sourceId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  title: string;
  mimeType: string | null;
  aiProjectId: string | null;
  aiConversationId: string | null;
  metadata: Record<string, unknown>;
  tokenEstimate: number;
  embedding: number[];
};

export async function deleteChunksForSource(sourceType: RagSourceType, sourceId: string) {
  await db
    .delete(ragChunks)
    .where(and(eq(ragChunks.sourceType, sourceType), eq(ragChunks.sourceId, sourceId)));
}

export async function deleteRagIndexForSource(sourceType: RagSourceType, sourceId: string) {
  await db
    .delete(ragIndexState)
    .where(and(eq(ragIndexState.sourceType, sourceType), eq(ragIndexState.sourceId, sourceId)));
}

export async function deleteRagSource(sourceType: RagSourceType, sourceId: string) {
  await deleteChunksForSource(sourceType, sourceId);
  await deleteRagIndexForSource(sourceType, sourceId);
}

export async function upsertIndexState(input: {
  sourceType: RagSourceType;
  sourceId: string;
  contentHash: string;
  chunkCount: number;
  status: "indexed" | "failed" | "pending";
  errorMessage?: string | null;
}) {
  const existing = await db
    .select({ id: ragIndexState.id })
    .from(ragIndexState)
    .where(
      and(
        eq(ragIndexState.sourceType, input.sourceType),
        eq(ragIndexState.sourceId, input.sourceId)
      )
    )
    .limit(1);

  const values = {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    contentHash: input.contentHash,
    chunkCount: input.chunkCount,
    status: input.status,
    errorMessage: input.errorMessage ?? null,
    indexedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(ragIndexState).set(values).where(eq(ragIndexState.id, existing[0].id));
    return;
  }

  await db.insert(ragIndexState).values(values);
}

export async function insertChunks(chunks: InsertChunk[]) {
  if (!chunks.length) return;

  const sql = getSqlClient();

  for (const chunk of chunks) {
    await sql`
      INSERT INTO rag_chunks (
        user_id,
        source_type,
        source_id,
        chunk_index,
        content,
        content_hash,
        title,
        mime_type,
        ai_project_id,
        ai_conversation_id,
        metadata,
        token_estimate,
        embedding,
        created_at,
        updated_at
      ) VALUES (
        ${chunk.userId},
        ${chunk.sourceType},
        ${chunk.sourceId},
        ${chunk.chunkIndex},
        ${chunk.content},
        ${chunk.contentHash},
        ${chunk.title},
        ${chunk.mimeType},
        ${chunk.aiProjectId},
        ${chunk.aiConversationId},
        ${JSON.stringify(chunk.metadata)}::jsonb,
        ${chunk.tokenEstimate},
        ${embeddingToVectorLiteral(chunk.embedding)}::vector,
        NOW(),
        NOW()
      )
    `;
  }
}

export async function searchSimilarChunks(input: {
  userId: string;
  queryEmbedding: number[];
  aiProjectId?: string | null;
  aiConversationId?: string | null;
  sourceTypes?: RagSourceType[];
  limit?: number;
  minSimilarity?: number;
}): Promise<RetrievedRagChunk[]> {
  const sql = getSqlClient();
  const limit = input.limit ?? RAG_DEFAULT_TOP_K;
  const minSimilarity = input.minSimilarity ?? RAG_MIN_SIMILARITY;
  const vectorLiteral = embeddingToVectorLiteral(input.queryEmbedding);

  const sourceTypeFilter =
    input.sourceTypes && input.sourceTypes.length
      ? sql`AND source_type IN ${sql(input.sourceTypes)}`
      : sql``;

  const projectFilter = input.aiProjectId
    ? sql`AND ai_project_id = ${input.aiProjectId}`
    : sql``;

  const conversationFilter = input.aiConversationId
    ? sql`AND ai_conversation_id = ${input.aiConversationId}`
    : sql``;

  const rows = await sql<
    Array<{
      id: string;
      source_type: RagSourceType;
      source_id: string;
      chunk_index: number;
      content: string;
      title: string;
      mime_type: string | null;
      ai_project_id: string | null;
      ai_conversation_id: string | null;
      metadata: Record<string, unknown> | null;
      similarity: number;
    }>
  >`
    SELECT
      id,
      source_type,
      source_id,
      chunk_index,
      content,
      title,
      mime_type,
      ai_project_id,
      ai_conversation_id,
      metadata,
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM rag_chunks
    WHERE user_id = ${input.userId}
      ${sourceTypeFilter}
      ${projectFilter}
      ${conversationFilter}
      AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    title: row.title,
    mimeType: row.mime_type,
    aiProjectId: row.ai_project_id,
    aiConversationId: row.ai_conversation_id,
    metadata: row.metadata ?? {},
    similarity: Number(row.similarity),
  }));
}

export async function getIndexState(sourceType: RagSourceType, sourceId: string) {
  const [row] = await db
    .select()
    .from(ragIndexState)
    .where(and(eq(ragIndexState.sourceType, sourceType), eq(ragIndexState.sourceId, sourceId)))
    .limit(1);
  return row ?? null;
}
