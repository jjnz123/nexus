import type { AiConversationFile, AiProjectFile, RagCitation, RagSearchScope } from "@/lib/db/schema";
import { buildFileContextBlock } from "@/lib/ai/file-context";
import { embedQuery } from "@/lib/rag/embeddings";
import { reciprocalRankFusion, rerankByScore } from "@/lib/rag/hybrid";
import { ensureAiFilesIndexed } from "@/lib/rag/indexer";
import { rewriteRetrievalQuery } from "@/lib/rag/query-rewrite";
import {
  logRetrievalHits,
  searchKeywordChunks,
  searchVectorChunks,
} from "@/lib/rag/store";
import {
  RAG_DEFAULT_TOP_K,
  RAG_HYBRID_CANDIDATE_LIMIT,
  RAG_MAX_CONTEXT_CHARS,
  buildCitationHref,
  isRagEnabled,
  normalizeSearchScopes,
  type RagContextResult,
  type RetrievedRagChunk,
} from "@/lib/rag/types";

function dedupeChunks(chunks: RetrievedRagChunk[]) {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const key = `${chunk.sourceType}:${chunk.sourceId}:${chunk.chunkIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function trimChunksToBudget(chunks: RetrievedRagChunk[], maxChars: number) {
  const selected: RetrievedRagChunk[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const next = chunk.content.length + 120;
    if (used + next > maxChars && selected.length) break;
    selected.push(chunk);
    used += next;
  }

  return selected;
}

export function buildRagContextBlock(chunks: RetrievedRagChunk[]): {
  contextBlock: string;
  citations: RagCitation[];
} {
  const citations: RagCitation[] = [];

  const sections = chunks.map((chunk, index) => {
    const citationNumber = index + 1;
    const excerpt =
      chunk.content.length > 240 ? `${chunk.content.slice(0, 240).trim()}…` : chunk.content;

    citations.push({
      chunkId: chunk.id,
      sourceType: chunk.sourceType,
      sourceId: chunk.sourceId,
      title: chunk.title,
      excerpt,
      href: buildCitationHref(chunk.sourceType, chunk.metadata),
    });

    return `[${citationNumber}] **${chunk.title}** (${chunk.sourceType}, score ${chunk.similarity.toFixed(2)})\n${chunk.content}`;
  });

  const contextBlock = [
    "## Retrieved knowledge (cite sources as [1], [2], …)",
    "Use the excerpts below when answering. If the answer is not supported by these sources, say so.",
    "",
    sections.join("\n\n---\n\n"),
  ].join("\n");

  return { contextBlock, citations };
}

export async function retrievePortalKnowledge(input: {
  userId: string;
  query: string;
  scopes?: RagSearchScope[];
  includeOrgTasks?: boolean;
  projectId?: string | null;
  conversationId?: string | null;
  meetingId?: string | null;
  projectFiles?: AiProjectFile[];
  conversationFiles?: AiConversationFile[];
  limit?: number;
  context?: string;
  rewriteQuery?: boolean;
  adminMode?: boolean;
}): Promise<RagContextResult> {
  const scopes = normalizeSearchScopes(input.scopes);
  const fallbackBlock =
    input.projectFiles || input.conversationFiles
      ? buildFileContextBlock(input.projectFiles ?? [], input.conversationFiles ?? [])
      : "";

  if (!isRagEnabled()) {
    return { contextBlock: fallbackBlock, citations: [], usedRag: false };
  }

  if (input.projectFiles?.length || input.conversationFiles?.length) {
    await ensureAiFilesIndexed(input.projectFiles ?? [], input.conversationFiles ?? []);
  }

  const retrievalQuery = input.rewriteQuery
    ? await rewriteRetrievalQuery(input.query)
    : input.query;

  const queryEmbedding = await embedQuery(retrievalQuery);
  if (!queryEmbedding.length) {
    return { contextBlock: fallbackBlock, citations: [], usedRag: false };
  }

  const searchInput = {
    userId: input.userId,
    query: retrievalQuery,
    queryEmbedding,
    scopes,
    includeOrgTasks: input.includeOrgTasks ?? scopes.includes("tasks"),
    adminMode: input.adminMode ?? false,
    aiProjectId: input.projectId ?? null,
    aiConversationId: input.conversationId ?? null,
    meetingId: input.meetingId ?? null,
    limit: input.limit ?? RAG_HYBRID_CANDIDATE_LIMIT,
  };

  const [vectorResults, keywordResults] = await Promise.all([
    searchVectorChunks(searchInput),
    searchKeywordChunks(searchInput),
  ]);

  const fused = rerankByScore(
    dedupeChunks(reciprocalRankFusion(vectorResults, keywordResults))
  ).slice(0, input.limit ?? RAG_DEFAULT_TOP_K);

  if (!fused.length) {
    return {
      contextBlock: fallbackBlock,
      citations: [],
      usedRag: false,
      retrievalQuery,
    };
  }

  const trimmed = trimChunksToBudget(fused, RAG_MAX_CONTEXT_CHARS);
  const { contextBlock, citations } = buildRagContextBlock(trimmed);

  await logRetrievalHits({
    userId: input.userId,
    query: retrievalQuery,
    context: input.context ?? "chat",
    chunks: trimmed,
  }).catch(() => undefined);

  return {
    contextBlock,
    citations,
    usedRag: true,
    retrievalQuery,
  };
}

export async function retrieveChatKnowledge(input: {
  userId: string;
  query: string;
  projectId: string | null;
  conversationId: string | null;
  projectFiles: AiProjectFile[];
  conversationFiles: AiConversationFile[];
  scopes?: RagSearchScope[];
  includeOrgTasks?: boolean;
  limit?: number;
}): Promise<RagContextResult> {
  return retrievePortalKnowledge({
    userId: input.userId,
    query: input.query,
    scopes: input.scopes,
    includeOrgTasks: input.includeOrgTasks,
    projectId: input.projectId,
    conversationId: input.conversationId,
    projectFiles: input.projectFiles,
    conversationFiles: input.conversationFiles,
    limit: input.limit,
    context: "chat",
    rewriteQuery: true,
  });
}

export async function retrieveMeetingKnowledge(input: {
  userId: string;
  meetingId: string;
  query: string;
}): Promise<RagContextResult> {
  return retrievePortalKnowledge({
    userId: input.userId,
    query: input.query,
    scopes: ["meetings"],
    meetingId: input.meetingId,
    context: "meeting",
    rewriteQuery: true,
  });
}
