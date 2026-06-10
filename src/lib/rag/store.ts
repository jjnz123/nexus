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
import type { RagSearchInput, RagChunkAdminRow, RetrievedRagChunk, RagSearchFilters } from "@/lib/rag/types";
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

function buildMetadataFilter(input: RagSearchInput, sql: ReturnType<typeof getSqlClient>) {
  const filters = input.filters;
  if (!filters) return sql``;

  let clause = sql``;

  if (filters.kanbanProjectId) {
    clause = sql`${clause} AND (
      kanban_project_id = ${filters.kanbanProjectId}
      OR metadata->>'projectId' = ${filters.kanbanProjectId}
    )`;
  }

  if (filters.meetingDateFrom) {
    clause = sql`${clause} AND (
      source_type NOT IN ${sql([
        RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
        RAG_SOURCE_TYPES.MEETING_SUMMARY,
        RAG_SOURCE_TYPES.MEETING_ACTION_ITEM,
      ])}
      OR (metadata->>'meetingAt')::timestamptz >= ${filters.meetingDateFrom}::timestamptz
    )`;
  }

  if (filters.meetingDateTo) {
    clause = sql`${clause} AND (
      source_type NOT IN ${sql([
        RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
        RAG_SOURCE_TYPES.MEETING_SUMMARY,
        RAG_SOURCE_TYPES.MEETING_ACTION_ITEM,
      ])}
      OR (metadata->>'meetingAt')::timestamptz <= ${filters.meetingDateTo}::timestamptz
    )`;
  }

  if (filters.meetingLabels?.length) {
    for (const label of filters.meetingLabels) {
      clause = sql`${clause} AND (
        source_type NOT IN ${sql([
          RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
          RAG_SOURCE_TYPES.MEETING_SUMMARY,
          RAG_SOURCE_TYPES.MEETING_ACTION_ITEM,
        ])}
        OR metadata->'labels' ? ${label}
      )`;
    }
  }

  if (filters.noteLanguage) {
    clause = sql`${clause} AND (
      source_type <> ${RAG_SOURCE_TYPES.USER_NOTE}
      OR metadata->>'language' = ${filters.noteLanguage}
    )`;
  }

  if (filters.taskDateFrom) {
    clause = sql`${clause} AND (
      source_type NOT IN ${sql([RAG_SOURCE_TYPES.TASK, RAG_SOURCE_TYPES.TASK_ATTACHMENT])}
      OR coalesce(
        (metadata->>'updatedAt')::timestamptz,
        (metadata->>'createdAt')::timestamptz
      ) >= ${filters.taskDateFrom}::timestamptz
    )`;
  }

  if (filters.taskDateTo) {
    clause = sql`${clause} AND (
      source_type NOT IN ${sql([RAG_SOURCE_TYPES.TASK, RAG_SOURCE_TYPES.TASK_ATTACHMENT])}
      OR coalesce(
        (metadata->>'updatedAt')::timestamptz,
        (metadata->>'createdAt')::timestamptz
      ) <= ${filters.taskDateTo}::timestamptz
    )`;
  }

  return clause;
}

function buildProjectScopeFilter(
  aiProjectId: string | null | undefined,
  sql: ReturnType<typeof getSqlClient>
) {
  if (!aiProjectId) return sql``;
  return sql`AND kanban_project_id = ${aiProjectId}`;
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
      ? sql`(source_type IN ${sql([RAG_SOURCE_TYPES.TASK, RAG_SOURCE_TYPES.TASK_ATTACHMENT])} AND scope = 'org')`
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
      ${buildMetadataFilter(input, sql)}
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

  const projectScope = buildProjectScopeFilter(input.aiProjectId, sql);

  const isGeneralConversation = !input.aiProjectId && Boolean(input.aiConversationId);

  const notesScope =
    input.scopes.includes("notes") && !isGeneralConversation
    ? sql`(source_type = ${RAG_SOURCE_TYPES.USER_NOTE} AND user_id = ${input.userId} ${projectScope})`
    : sql`FALSE`;

  const meetingsScope =
    !isGeneralConversation && input.scopes.includes("meetings")
    ? input.meetingId
      ? sql`(source_type IN ${sql([
          RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
          RAG_SOURCE_TYPES.MEETING_SUMMARY,
          RAG_SOURCE_TYPES.MEETING_ACTION_ITEM,
        ])} AND user_id = ${input.userId} AND meeting_id = ${input.meetingId} ${projectScope})`
      : sql`(source_type IN ${sql([
          RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
          RAG_SOURCE_TYPES.MEETING_SUMMARY,
          RAG_SOURCE_TYPES.MEETING_ACTION_ITEM,
        ])} AND user_id = ${input.userId} AND coalesce(metadata->>'archived', 'false') = 'false' ${projectScope})`
    : sql`FALSE`;

  const tasksScope =
    !isGeneralConversation &&
    input.scopes.includes("tasks") &&
    input.includeOrgTasks
      ? sql`(source_type IN ${sql([RAG_SOURCE_TYPES.TASK, RAG_SOURCE_TYPES.TASK_ATTACHMENT])} AND scope = 'org' ${projectScope})`
      : sql`FALSE`;

  return sql`
    AND source_type IN ${sql(sourceTypes)}
    AND (${fileScope} OR ${notesScope} OR ${meetingsScope} OR ${tasksScope})
    ${buildMetadataFilter(input, sql)}
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

export async function logRetrievalRun(input: {
  userId: string;
  query: string;
  rewrittenQuery?: string;
  context: string;
  scopes: string[];
  filters?: RagSearchFilters;
  vectorCount: number;
  keywordCount: number;
  fusedCount: number;
  usedCount: number;
  durationMs: number;
  success: boolean;
  vectorResults: RetrievedRagChunk[];
  keywordResults: RetrievedRagChunk[];
  fusedResults: RetrievedRagChunk[];
  usedChunks: RetrievedRagChunk[];
}) {
  const sql = getSqlClient();
  const [run] = await sql<Array<{ id: string }>>`
    INSERT INTO rag_retrieval_runs (
      user_id,
      query,
      rewritten_query,
      context,
      scopes,
      filters,
      vector_count,
      keyword_count,
      fused_count,
      used_count,
      duration_ms,
      success
    ) VALUES (
      ${input.userId},
      ${input.query.slice(0, 2000)},
      ${input.rewrittenQuery?.slice(0, 2000) ?? null},
      ${input.context},
      ${JSON.stringify(input.scopes)}::jsonb,
      ${JSON.stringify(input.filters ?? {})}::jsonb,
      ${input.vectorCount},
      ${input.keywordCount},
      ${input.fusedCount},
      ${input.usedCount},
      ${input.durationMs},
      ${input.success}
    )
    RETURNING id
  `;

  const runId = run?.id;
  if (!runId) return null;

  const vectorById = new Map(input.vectorResults.map((chunk) => [chunk.id, chunk]));
  const keywordById = new Map(input.keywordResults.map((chunk) => [chunk.id, chunk]));
  const usedIds = new Set(input.usedChunks.map((chunk) => chunk.id));

  const logRows = input.fusedResults.map((chunk) => {
    const vector = vectorById.get(chunk.id);
    const keyword = keywordById.get(chunk.id);
    return {
      userId: input.userId,
      runId,
      query: input.query.slice(0, 2000),
      sourceType: chunk.sourceType,
      sourceId: chunk.sourceId,
      chunkId: chunk.id,
      similarity: vector?.similarity ?? vector?.vectorScore ?? null,
      keywordScore: keyword?.keywordScore ?? keyword?.similarity ?? chunk.keywordScore ?? null,
      fusedScore: chunk.fusedScore ?? chunk.similarity,
      usedInContext: usedIds.has(chunk.id),
      context: input.context,
    };
  });

  if (logRows.length) {
    await db.insert(ragRetrievalLogs).values(logRows);
  }

  return runId;
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
      similarity: chunk.vectorScore ?? chunk.similarity,
      keywordScore: chunk.keywordScore ?? null,
      fusedScore: chunk.fusedScore ?? chunk.similarity,
      usedInContext: true,
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

  const topSources7Days = await sql<
    Array<{ source_type: string; source_id: string; hits: number; last_hit: string }>
  >`
    SELECT source_type, source_id, count(*)::int AS hits, max(created_at)::text AS last_hit
    FROM rag_retrieval_logs
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND used_in_context = true
    GROUP BY source_type, source_id
    ORDER BY hits DESC
    LIMIT 10
  `;

  const topSources = await sql<
    Array<{ source_type: string; source_id: string; hits: number; last_hit: string }>
  >`
    SELECT source_type, source_id, count(*)::int AS hits, max(created_at)::text AS last_hit
    FROM rag_retrieval_logs
    WHERE created_at >= NOW() - INTERVAL '30 days'
      AND used_in_context = true
    GROUP BY source_type, source_id
    ORDER BY hits DESC
    LIMIT 10
  `;

  const [retrievalStats] = await sql<
    Array<{
      total_runs: number;
      successful_runs: number;
      avg_duration_ms: number | null;
      avg_used_count: number | null;
    }>
  >`
    SELECT
      count(*)::int AS total_runs,
      count(*) FILTER (WHERE success = true)::int AS successful_runs,
      avg(duration_ms)::float AS avg_duration_ms,
      avg(used_count)::float AS avg_used_count
    FROM rag_retrieval_runs
    WHERE created_at >= NOW() - INTERVAL '30 days'
  `;

  const lowRelevanceQueries = await sql<
    Array<{ query: string; hits: number; avg_fused: number | null }>
  >`
    SELECT
      query,
      count(*)::int AS hits,
      avg(fused_score)::float AS avg_fused
    FROM rag_retrieval_logs
    WHERE created_at >= NOW() - INTERVAL '30 days'
      AND fused_score IS NOT NULL
      AND fused_score < 0.015
    GROUP BY query
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
    topSources7Days,
    topSources,
    retrievalStats: retrievalStats ?? {
      total_runs: 0,
      successful_runs: 0,
      avg_duration_ms: null,
      avg_used_count: null,
    },
    lowRelevanceQueries,
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

export async function listFailedRagIndexStates(limit = 50) {
  return db
    .select()
    .from(ragIndexState)
    .where(eq(ragIndexState.status, "failed"))
    .orderBy(desc(ragIndexState.updatedAt))
    .limit(limit);
}

export async function searchRagChunksAdmin(input: {
  query?: string;
  sourceType?: RagSourceType;
  sourceId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ chunks: RagChunkAdminRow[]; total: number }> {
  const sql = getSqlClient();
  const limit = input.limit ?? 25;
  const offset = input.offset ?? 0;
  const search = input.query?.trim() ?? "";

  const rows = await sql<
    Array<{
      id: string;
      source_type: RagSourceType;
      source_id: string;
      chunk_index: number;
      title: string;
      content: string;
      metadata: Record<string, unknown> | null;
      updated_at: string;
      total_count: number;
    }>
  >`
    SELECT
      id,
      source_type,
      source_id,
      chunk_index,
      title,
      content,
      metadata,
      updated_at::text,
      count(*) OVER()::int AS total_count
    FROM rag_chunks
    WHERE 1 = 1
      ${input.sourceType ? sql`AND source_type = ${input.sourceType}` : sql``}
      ${input.sourceId ? sql`AND source_id = ${input.sourceId}` : sql``}
      ${
        search
          ? sql`AND (
              title ILIKE ${`%${search}%`}
              OR content ILIKE ${`%${search}%`}
              OR search_vector @@ websearch_to_tsquery('english', ${search})
            )`
          : sql``
      }
    ORDER BY updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const total = rows[0]?.total_count ?? 0;

  return {
    total,
    chunks: rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      chunkIndex: row.chunk_index,
      title: row.title,
      contentPreview:
        row.content.length > 320 ? `${row.content.slice(0, 320).trim()}…` : row.content,
      metadata: row.metadata ?? {},
      indexedAt: row.updated_at,
    })),
  };
}

export async function deleteRagChunkById(chunkId: string) {
  await db.delete(ragChunks).where(eq(ragChunks.id, chunkId));
}
