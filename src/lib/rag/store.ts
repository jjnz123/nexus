import { and, desc, eq, sql as drizzleSql } from "drizzle-orm";
import { db, getSqlClient } from "@/lib/db";
import {
  ragChunks,
  ragIndexState,
  ragRetrievalLogs,
  type RagScope,
  type RagSourceType,
} from "@/lib/db/schema";
import { embeddingToVectorLiteral } from "@/lib/rag/embeddings";
import type { RagSearchInput, RetrievedRagChunk } from "@/lib/rag/types";
import {
  RAG_DEFAULT_TOP_K,
  RAG_HYBRID_CANDIDATE_LIMIT,
  RAG_MIN_SIMILARITY,
  RAG_SOURCE_TYPES,
  scopesToSourceTypes,
} from "@/lib/rag/types";

type InsertChunk = {
  userId: string;
  sourceType: RagSourceType;
  sourceId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  title: string;
  mimeType: string | null;
  scope: RagScope;
  aiProjectId: string | null;
  aiConversationId: string | null;
  meetingId: string | null;
  noteId: string | null;
  taskId: string | null;
  kanbanProjectId: string | null;
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

export async function deleteMeetingRagSources(meetingId: string) {
  const sql = getSqlClient();
  await sql`DELETE FROM rag_chunks WHERE meeting_id = ${meetingId}`;
  await sql`
    DELETE FROM rag_index_state
    WHERE source_type IN ${sql([
      RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
      RAG_SOURCE_TYPES.MEETING_SUMMARY,
      RAG_SOURCE_TYPES.MEETING_ACTION_ITEM,
    ])}
      AND (
        source_id = ${meetingId}
        OR source_id IN (
          SELECT id FROM meeting_action_items WHERE meeting_id = ${meetingId}
        )
      )
  `;
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
        scope,
        ai_project_id,
        ai_conversation_id,
        meeting_id,
        note_id,
        task_id,
        kanban_project_id,
        metadata,
        token_estimate,
        embedding,
        search_vector,
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
        ${chunk.scope},
        ${chunk.aiProjectId},
        ${chunk.aiConversationId},
        ${chunk.meetingId},
        ${chunk.noteId},
        ${chunk.taskId},
        ${chunk.kanbanProjectId},
        ${JSON.stringify(chunk.metadata)}::jsonb,
        ${chunk.tokenEstimate},
        ${embeddingToVectorLiteral(chunk.embedding)}::vector,
        to_tsvector('english', ${`${chunk.title}\n${chunk.content}`}),
        NOW(),
        NOW()
      )
    `;
  }
}

function mapChunkRow(row: {
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
  keyword_score?: number | null;
}): RetrievedRagChunk {
  return {
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
    keywordScore: row.keyword_score != null ? Number(row.keyword_score) : undefined,
  };
}

function buildAccessFilter(input: RagSearchInput, sql: ReturnType<typeof getSqlClient>) {
  const sourceTypes = scopesToSourceTypes(input.scopes);
  if (!sourceTypes.length) return sql`AND FALSE`;

  if (input.adminMode) {
    const notesScope = input.scopes.includes("notes")
      ? sql`(source_type = ${RAG_SOURCE_TYPES.USER_NOTE})`
      : sql`FALSE`;
    const meetingsScope = input.scopes.includes("meetings")
      ? sql`(source_type IN ${sql([
          RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
          RAG_SOURCE_TYPES.MEETING_SUMMARY,
          RAG_SOURCE_TYPES.MEETING_ACTION_ITEM,
        ])} AND coalesce(metadata->>'archived', 'false') = 'false')`
      : sql`FALSE`;
    const tasksScope = input.scopes.includes("tasks")
      ? sql`(source_type = ${RAG_SOURCE_TYPES.TASK} AND scope = 'org')`
      : sql`FALSE`;
    const filesScope = input.scopes.includes("files")
      ? sql`(source_type IN ${sql([
          RAG_SOURCE_TYPES.AI_PROJECT_FILE,
          RAG_SOURCE_TYPES.AI_CONVERSATION_FILE,
        ])})`
      : sql`FALSE`;

    return sql`
      AND source_type IN ${sql(sourceTypes)}
      AND (${filesScope} OR ${notesScope} OR ${meetingsScope} OR ${tasksScope})
    `;
  }

  const fileScope = input.scopes.includes("files")
    ? sql`
        (
          source_type IN ${sql([RAG_SOURCE_TYPES.AI_PROJECT_FILE, RAG_SOURCE_TYPES.AI_CONVERSATION_FILE])}
          AND user_id = ${input.userId}
          AND (
            (${input.aiProjectId ?? null}::uuid IS NOT NULL AND ai_project_id = ${input.aiProjectId ?? null})
            OR (${input.aiConversationId ?? null}::uuid IS NOT NULL AND ai_conversation_id = ${input.aiConversationId ?? null})
          )
        )
      `
    : sql`FALSE`;

  const notesScope = input.scopes.includes("notes")
    ? sql`(source_type = ${RAG_SOURCE_TYPES.USER_NOTE} AND user_id = ${input.userId})`
    : sql`FALSE`;

  const meetingsScope = input.scopes.includes("meetings")
    ? input.meetingId
      ? sql`(source_type IN ${sql([
          RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
          RAG_SOURCE_TYPES.MEETING_SUMMARY,
          RAG_SOURCE_TYPES.MEETING_ACTION_ITEM,
        ])} AND user_id = ${input.userId} AND meeting_id = ${input.meetingId})`
      : sql`(source_type IN ${sql([
          RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
          RAG_SOURCE_TYPES.MEETING_SUMMARY,
          RAG_SOURCE_TYPES.MEETING_ACTION_ITEM,
        ])} AND user_id = ${input.userId} AND coalesce(metadata->>'archived', 'false') = 'false')`
    : sql`FALSE`;

  const tasksScope =
    input.scopes.includes("tasks") && input.includeOrgTasks
      ? sql`(source_type = ${RAG_SOURCE_TYPES.TASK} AND scope = 'org')`
      : sql`FALSE`;

  return sql`
    AND source_type IN ${sql(sourceTypes)}
    AND (${fileScope} OR ${notesScope} OR ${meetingsScope} OR ${tasksScope})
  `;
}

export async function searchVectorChunks(input: RagSearchInput): Promise<RetrievedRagChunk[]> {
  const sql = getSqlClient();
  const limit = input.limit ?? RAG_HYBRID_CANDIDATE_LIMIT;
  const minSimilarity = input.minSimilarity ?? RAG_MIN_SIMILARITY;
  const vectorLiteral = embeddingToVectorLiteral(input.queryEmbedding);
  const accessFilter = buildAccessFilter(input, sql);

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
    WHERE 1 = 1
      ${accessFilter}
      AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `;

  return rows.map(mapChunkRow);
}

export async function searchKeywordChunks(input: RagSearchInput): Promise<RetrievedRagChunk[]> {
  const sql = getSqlClient();
  const limit = input.limit ?? RAG_HYBRID_CANDIDATE_LIMIT;
  const accessFilter = buildAccessFilter(input, sql);

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
      keyword_score: number | null;
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
      ts_rank_cd(search_vector, websearch_to_tsquery('english', ${input.query})) AS similarity,
      ts_rank_cd(search_vector, websearch_to_tsquery('english', ${input.query})) AS keyword_score
    FROM rag_chunks
    WHERE search_vector @@ websearch_to_tsquery('english', ${input.query})
      ${accessFilter}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;

  return rows.map(mapChunkRow);
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
  return searchVectorChunks({
    userId: input.userId,
    query: "",
    queryEmbedding: input.queryEmbedding,
    scopes: ["files"],
    aiProjectId: input.aiProjectId,
    aiConversationId: input.aiConversationId,
    includeOrgTasks: false,
    limit: input.limit ?? RAG_DEFAULT_TOP_K,
    minSimilarity: input.minSimilarity,
  });
}

export async function getIndexState(sourceType: RagSourceType, sourceId: string) {
  const [row] = await db
    .select()
    .from(ragIndexState)
    .where(and(eq(ragIndexState.sourceType, sourceType), eq(ragIndexState.sourceId, sourceId)))
    .limit(1);
  return row ?? null;
}

export async function logRetrievalHits(input: {
  userId: string;
  query: string;
  context: string;
  chunks: RetrievedRagChunk[];
}) {
  if (!input.chunks.length) return;

  await db.insert(ragRetrievalLogs).values(
    input.chunks.map((chunk) => ({
      userId: input.userId,
      query: input.query.slice(0, 2000),
      sourceType: chunk.sourceType,
      sourceId: chunk.sourceId,
      chunkId: chunk.id,
      similarity: chunk.similarity,
      context: input.context,
    }))
  );
}

export async function getRagAnalyticsSummary() {
  const sql = getSqlClient();

  const [indexStats] = await sql<
    Array<{
      total_sources: number;
      indexed_sources: number;
      failed_sources: number;
      total_chunks: number;
    }>
  >`
    SELECT
      (SELECT count(*)::int FROM rag_index_state) AS total_sources,
      (SELECT count(*)::int FROM rag_index_state WHERE status = 'indexed') AS indexed_sources,
      (SELECT count(*)::int FROM rag_index_state WHERE status = 'failed') AS failed_sources,
      (SELECT count(*)::int FROM rag_chunks) AS total_chunks
  `;

  const sourceBreakdown = await sql<Array<{ source_type: string; count: number }>>`
    SELECT source_type, count(*)::int AS count
    FROM rag_index_state
    GROUP BY source_type
    ORDER BY count DESC
  `;

  const topSources = await sql<
    Array<{ source_type: string; source_id: string; hits: number; last_hit: string }>
  >`
    SELECT source_type, source_id, count(*)::int AS hits, max(created_at)::text AS last_hit
    FROM rag_retrieval_logs
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY source_type, source_id
    ORDER BY hits DESC
    LIMIT 10
  `;

  return {
    indexStats: indexStats ?? {
      total_sources: 0,
      indexed_sources: 0,
      failed_sources: 0,
      total_chunks: 0,
    },
    sourceBreakdown,
    topSources,
  };
}

export async function listRagIndexStates(limit = 100) {
  return db
    .select()
    .from(ragIndexState)
    .orderBy(desc(ragIndexState.updatedAt))
    .limit(limit);
}

export async function countRagIndexStates() {
  const [row] = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(ragIndexState);
  return row?.count ?? 0;
}
